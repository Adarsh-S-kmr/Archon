/**
 * Blast Radius Calculator
 *
 * Looks up mock_environment for the action's target table and computes
 * a real estimate of how many rows would be affected, replacing the
 * LLM's self-reported guess with ground-truth numbers.
 *
 * Returns a blastRadius object that gets merged into the action data
 * before policy evaluation.
 */

const prisma = require("./prisma");

// Condition heuristics
// Simple pattern-based estimation for what fraction of a table
// a WHERE condition would touch. Not a SQL parser — just enough
// to be better than the LLM's blind guess.

const CONDITION_PATTERNS = [
  // Very selective — single-row or small-set lookups
  { regex: /\bid\s*=\s*/i, fraction: 0.001 },
  { regex: /\bemail\s*=\s*/i, fraction: 0.001 },
  { regex: /\btoken\s*=\s*/i, fraction: 0.001 },
  { regex: /\bord_id\s*=\s*/i, fraction: 0.001 },
  { regex: /\bsession_id\s*=\s*/i, fraction: 0.001 },
  { regex: /\bLIMIT\s+\d+/i, fraction: 0.01 },

  // Medium selectivity — status/flag filters
  { regex: /\bstatus\s*=\s*/i, fraction: 0.15 },
  { regex: /\bis_active\s*=\s*(false|0|'false')/i, fraction: 0.10 },
  { regex: /\bis_temp\s*=\s*/i, fraction: 0.05 },
  { regex: /\brole\s*=\s*/i, fraction: 0.10 },

  // Date-range filters — typically larger sets
  { regex: /\b(created_at|updated_at|last_login|expires_at)\s*[<>]/i, fraction: 0.25 },
  { regex: /\bINTERVAL\b/i, fraction: 0.20 },
  { regex: /\bNOW\(\)/i, fraction: 0.20 },

  // Inequality — moderate selectivity
  { regex: /\b(price|count|amount)\s*[<>]/i, fraction: 0.15 },

  // IS NULL — usually small fraction
  { regex: /\bIS\s+NULL\b/i, fraction: 0.05 },
  { regex: /\bIS\s+NOT\s+NULL\b/i, fraction: 0.90 },
];

/**
 * Estimate what fraction of a table a condition would affect.
 * Uses pattern matching as a heuristic — picks the first matching pattern.
 *
 * @param {string|null} condition - SQL WHERE condition text
 * @returns {number} fraction between 0 and 1
 */
function estimateConditionSelectivity(condition) {
  if (!condition || condition.trim() === "" || condition.trim().toLowerCase() === "null") {
    return 1.0; // No condition = all rows
  }

  const trimmed = condition.trim().toLowerCase();

  if (/^(1\s*=\s*1|all|true|0\s*=\s*0|'a'\s*=\s*'a'|\*|1)$/i.test(trimmed)) {
    return 1.0;
  }

  for (const { regex, fraction } of CONDITION_PATTERNS) {
    if (regex.test(condition)) {
      return fraction;
    }
  }

  // Default: assume ~30% if condition exists but pattern unknown
  return 0.30;
}

/**
 * Compute blast radius for an action.
 *
 * @param {object} actionPayload - { action_type, target, condition, environment, self_reported_rows_affected }
 * @returns {Promise<object>} blastRadius object
 */
async function computeBlastRadius(actionPayload) {
  const target = (actionPayload.target || "").toLowerCase().trim();

  // Look up the target table in mock_environment
  const envRow = target
    ? await prisma.mockEnvironment.findUnique({ where: { tableName: target } })
    : null;

  const tableRowCount = envRow?.rowCount ?? null;
  const lastBackupAt = envRow?.lastBackupAt ?? null;

  // Compute backup age
  let backupAgeHours = null;
  if (lastBackupAt) {
    backupAgeHours = Math.round((Date.now() - new Date(lastBackupAt).getTime()) / (1000 * 60 * 60));
  }

  // Estimate affected rows
  let estimatedRows;
  let source; // where the estimate came from

  if (actionPayload.action_type === "DROP") {
    // DROP always affects the entire table
    estimatedRows = tableRowCount ?? 0;
    source = "drop_all";
  } else if (tableRowCount !== null) {
    // We have real table metadata — use condition selectivity
    const selectivity = estimateConditionSelectivity(actionPayload.condition);
    estimatedRows = Math.round(tableRowCount * selectivity);
    source = `mock_environment (${Math.round(selectivity * 100)}% of ${tableRowCount.toLocaleString()} rows)`;
  } else {
    // No mock_environment entry — fall back to LLM self-report
    estimatedRows = Number(actionPayload.self_reported_rows_affected) || 0;
    source = "llm_self_report (no mock_environment data)";
  }

  // Compute blast percentage
  const blastPercentage = tableRowCount
    ? Math.round((estimatedRows / tableRowCount) * 100)
    : null;

  // Cost delta: simple heuristic — each row operation "costs" 1 unit
  // DROP costs 10x because it includes schema destruction
  const costMultiplier = actionPayload.action_type === "DROP" ? 10 : 1;
  const costDelta = estimatedRows * costMultiplier;

  return {
    estimated_rows: estimatedRows,
    table_row_count: tableRowCount,
    blast_percentage: blastPercentage,
    has_backup: lastBackupAt !== null,
    backup_age_hours: backupAgeHours,
    last_backup_at: lastBackupAt,
    cost_delta: costDelta,
    estimation_source: source,
    condition_selectivity: estimateConditionSelectivity(actionPayload.condition),
  };
}

module.exports = {
  computeBlastRadius,
  estimateConditionSelectivity,
};

/**
 * Policy Engine — evaluateAction(action, policies, context)
 *
 * Pure function: takes an action object and an array of active policies,
 * returns a list of decisions. Each decision is { policyId, policyName, decision, reason }.
 *
 * Decisions: "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL"
 *
 * The action shape expected (from the payload stored in the actions table):
 *   { action_type, target, condition, environment,
 *     self_reported_rows_affected, self_reported_risk }
 *
 * Context shape (optional, from mock_environment):
 *   { lastBackupAt?: Date|string }
 */

// Constants
const DESTRUCTIVE_TYPES = ["DELETE", "DROP"];
const MAX_ROWS_BEFORE_BLOCK = 5000;
const BACKUP_FRESHNESS_HOURS = 24;

// Hardcoded allowed targets — stub for scope-violation policy until RBAC exists
const ALLOWED_TARGETS = ["users", "orders", "sessions", "logs", "products"];

// Strictly permitted database action types
const ALLOWED_ACTION_TYPES = ["SELECT", "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE"];

// Core evaluator

/**
 * Evaluate an action against all active policies.
 *
 * @param {object}   action   - The action's payload (action_type, target, condition, environment, etc.)
 * @param {object[]} policies - Array of active policy rows from the DB
 * @param {object}   [context={}] - Extra context (e.g. lastBackupAt from mock_environment)
 * @returns {object[]} Array of { policyId, policyName, decision, reason }
 */
function evaluateAction(action, policies, context = {}) {
  const actionType = String(action.action_type || "").toUpperCase().trim();

  // Pre-check: Block unknown or unauthorized action verbs (e.g. "RUN", "EXEC", "SHUTDOWN")
  if (!ALLOWED_ACTION_TYPES.includes(actionType)) {
    return [
      {
        policyId: null,
        policyName: "unsupported-action-type",
        decision: "BLOCK",
        reason: `Operation verb "${action.action_type}" is not an authorized database action [${ALLOWED_ACTION_TYPES.join(", ")}]`,
      },
    ];
  }

  const decisions = [];

  for (const policy of policies) {
    const result = evaluateSinglePolicy(action, policy, context);
    if (result) {
      decisions.push(result);
    }
  }

  // If no policy triggered, default ALLOW
  if (decisions.length === 0) {
    decisions.push({
      policyId: null,
      policyName: "default",
      decision: "ALLOW",
      reason: "No policy rule matched — action allowed by default",
    });
  }

  return decisions;
}

/**
 * Evaluate a single policy against an action.
 * Returns a decision object if the policy fires, or null if it doesn't apply.
 */
function evaluateSinglePolicy(action, policy, context) {
  const { name } = policy;

  switch (name) {
    case "no-unbounded-destructive":
      return evaluateUnboundedDestructive(action, policy);

    case "max-rows-threshold":
      return evaluateMaxRows(action, policy);

    case "production-destructive-approval":
      return evaluateProductionDestructive(action, policy);

    case "no-backup-destructive":
      return evaluateNoBackupDestructive(action, policy, context);

    case "scope-violation":
      return evaluateScopeViolation(action, policy);

    default:
      return null;
  }
}

// Individual policy evaluators

/**
 * Policy 1: No unbounded DELETE/DROP without WHERE
 * If action_type is DELETE or DROP and condition is empty/null → BLOCK
 */
function evaluateUnboundedDestructive(action, policy) {
  const isDestructive = DESTRUCTIVE_TYPES.includes(action.action_type);

  const conditionStr = (action.condition || "").trim().toLowerCase();

  const hasNoCondition = !action.condition || action.condition.trim() === "" || action.condition.trim().toLowerCase() === "null";
  const isTautology = /^(1\s*=\s*1|all|true|0\s*=\s*0|'a'\s*=\s*'a')$/i.test(conditionStr);


  if (isDestructive && (hasNoCondition || isTautology)) {
    return {
      policyId: policy.id,
      policyName: policy.name,
      decision: "BLOCK",
      reason: `${action.action_type} on "${action.target}" ${isTautology ? "uses an unbounded condition (1=1)" : "has no WHERE condition"} — full-table destructive operations are blocked`,
    };
  }

  return null;
}

/**
 * Policy 2: Rows affected > 5,000 → BLOCK
 * Uses self_reported_rows_affected from the LLM
 */
function evaluateMaxRows(action, policy) {
  const rows = Number(action.self_reported_rows_affected) || 0;

  if (rows > MAX_ROWS_BEFORE_BLOCK) {
    return {
      policyId: policy.id,
      policyName: policy.name,
      decision: "BLOCK",
      reason: `Estimated ${rows.toLocaleString()} rows affected exceeds the ${MAX_ROWS_BEFORE_BLOCK.toLocaleString()}-row safety threshold`,
    };
  }

  return null;
}

/**
 * Policy 3: Production + destructive → REQUIRE_APPROVAL
 * If environment is "production" and action_type is DELETE or DROP → escalate
 */
function evaluateProductionDestructive(action, policy) {
  const isDestructive = DESTRUCTIVE_TYPES.includes(action.action_type);
  const isProduction = action.environment === "production";

  if (isProduction && isDestructive) {
    return {
      policyId: policy.id,
      policyName: policy.name,
      decision: "REQUIRE_APPROVAL",
      reason: `${action.action_type} in production requires human approval before execution`,
    };
  }

  return null;
}

/**
 * Policy 4: No recent backup + destructive → BLOCK
 * If the target table hasn't been backed up within BACKUP_FRESHNESS_HOURS and action is destructive → BLOCK
 */
function evaluateNoBackupDestructive(action, policy, context) {
  const isDestructive = DESTRUCTIVE_TYPES.includes(action.action_type);
  if (!isDestructive) return null;

  const lastBackup = context.lastBackupAt ? new Date(context.lastBackupAt) : null;

  if (!lastBackup) {
    return {
      policyId: policy.id,
      policyName: policy.name,
      decision: "BLOCK",
      reason: `No backup found for "${action.target}" — destructive operations require a recent backup`,
    };
  }

  const hoursSinceBackup = (Date.now() - lastBackup.getTime()) / (1000 * 60 * 60);

  if (hoursSinceBackup > BACKUP_FRESHNESS_HOURS) {
    return {
      policyId: policy.id,
      policyName: policy.name,
      decision: "BLOCK",
      reason: `Last backup for "${action.target}" was ${Math.round(hoursSinceBackup)}h ago (threshold: ${BACKUP_FRESHNESS_HOURS}h) — destructive operations blocked until backup is refreshed`,
    };
  }

  return null;
}

/**
 * Policy 5: Scope violation — target not in allowed list
 * Stub RBAC: hardcoded allowed targets for now
 */
function evaluateScopeViolation(action, policy) {
  const target = (action.target || "").toLowerCase().trim();

  if (!ALLOWED_TARGETS.includes(target)) {
    return {
      policyId: policy.id,
      policyName: policy.name,
      decision: "BLOCK",
      reason: `Target "${action.target}" is not in the allowed target list [${ALLOWED_TARGETS.join(", ")}]`,
    };
  }

  return null;
}

// Aggregate helper

/**
 * Given an array of individual policy decisions, compute the final verdict.
 * Priority: BLOCK > REQUIRE_APPROVAL > ALLOW
 *
 * @param {object[]} decisions - Array of { decision, ... }
 * @returns {{ finalDecision: string, triggeringPolicies: object[] }}
 */
function aggregateDecisions(decisions) {
  const blocks = decisions.filter((d) => d.decision === "BLOCK");
  if (blocks.length > 0) {
    return { finalDecision: "BLOCK", triggeringPolicies: blocks };
  }

  const approvals = decisions.filter((d) => d.decision === "REQUIRE_APPROVAL");
  if (approvals.length > 0) {
    return { finalDecision: "REQUIRE_APPROVAL", triggeringPolicies: approvals };
  }

  return { finalDecision: "ALLOW", triggeringPolicies: decisions };
}

module.exports = {
  evaluateAction,
  aggregateDecisions,
  // Export constants for tests
  DESTRUCTIVE_TYPES,
  MAX_ROWS_BEFORE_BLOCK,
  ALLOWED_TARGETS,
  ALLOWED_ACTION_TYPES,
};

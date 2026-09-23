const { Router } = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = Router();

// Seed baseline row counts and metadata
const BASELINE_ENVIRONMENT = [
  {
    tableName: "users",
    rowCount: 12421,
    // Stale backup: ~7 days old, so production-destructive-backup policy properly triggers
    lastBackupAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    metadata: {
      description: "Application user accounts and profiles",
      columns: [
        { name: "id", type: "uuid", pk: true },
        { name: "email", type: "varchar(255)", unique: true },
        { name: "name", type: "varchar(100)" },
        { name: "role", type: "varchar(50)" },
        { name: "created_at", type: "timestamp" },
        { name: "last_login", type: "timestamp" },
      ],
      avgRowSizeBytes: 256,
      indexCount: 3,
    },
  },
  {
    tableName: "orders",
    rowCount: 45231,
    lastBackupAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    metadata: {
      description: "Customer checkout and order records",
      columns: [
        { name: "id", type: "uuid", pk: true },
        { name: "user_id", type: "uuid", fk: "users.id" },
        { name: "total", type: "numeric(10,2)" },
        { name: "status", type: "varchar(50)" },
        { name: "created_at", type: "timestamp" },
        { name: "shipped_at", type: "timestamp" },
      ],
      avgRowSizeBytes: 512,
      indexCount: 5,
    },
  },
  {
    tableName: "sessions",
    rowCount: 8340,
    // Fresh backup: 1 hour ago
    lastBackupAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
    metadata: {
      description: "Active authentication sessions & tokens",
      columns: [
        { name: "id", type: "uuid", pk: true },
        { name: "user_id", type: "uuid", fk: "users.id" },
        { name: "token", type: "varchar(512)" },
        { name: "expires_at", type: "timestamp" },
        { name: "created_at", type: "timestamp" },
      ],
      avgRowSizeBytes: 128,
      indexCount: 2,
    },
  },
];

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * GET /api/environment
 * Returns all managed tables with dynamic row counts, schema, backup status,
 * and recent operations affecting each table.
 */
router.get("/environment", async (req, res) => {
  try {
    const tables = await prisma.mockEnvironment.findMany({
      orderBy: { tableName: "asc" },
    });

    // Also fetch recent actions to map recent operations per table
    const recentActions = await prisma.action.findMany({
      take: 30,
      orderBy: { createdAt: "desc" },
      include: {
        task: { select: { name: true } },
        executions: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { status: true, result: true, completedAt: true },
        },
        policyDecisions: {
          take: 1,
          orderBy: { decidedAt: "desc" },
          select: { decision: true, reason: true },
        },
      },
    });

    let totalRows = 0;
    let totalSizeBytes = 0;

    const enrichedTables = tables.map((t) => {
      const meta = t.metadata || {};
      const avgRowSize = meta.avgRowSizeBytes || 256;
      const sizeBytes = t.rowCount * avgRowSize;
      totalRows += t.rowCount;
      totalSizeBytes += sizeBytes;

      const backupAgeMs = Date.now() - new Date(t.lastBackupAt).getTime();
      const backupAgeHours = Math.max(0, Math.round(backupAgeMs / (1000 * 60 * 60)));

      // Find actions targeting this table
      const tableActions = recentActions
        .filter((a) => {
          const target = (a.payload?.target || "").toLowerCase().trim();
          return target === t.tableName.toLowerCase();
        })
        .slice(0, 5)
        .map((a) => ({
          id: a.id,
          task_name: a.task?.name || "Operation",
          type: a.type,
          status: a.status,
          decision: a.policyDecisions[0]?.decision || null,
          decision_reason: a.policyDecisions[0]?.reason || null,
          execution_result: a.executions[0]?.result || null,
          created_at: a.createdAt,
        }));

      return {
        id: t.id,
        table_name: t.tableName,
        row_count: t.rowCount,
        last_backup_at: t.lastBackupAt,
        backup_age_hours: backupAgeHours,
        backup_is_fresh: backupAgeHours <= 24,
        description: meta.description || `${t.tableName} data table`,
        columns: meta.columns || [],
        avg_row_size_bytes: avgRowSize,
        size_bytes: sizeBytes,
        size_formatted: formatBytes(sizeBytes),
        is_dropped: meta.dropped === true || t.rowCount === 0,
        recent_operations: tableActions,
      };
    });

    return res.status(200).json({
      success: true,
      environment: "production",
      db_type: "PostgreSQL 16",
      summary: {
        total_tables: tables.length,
        total_rows: totalRows,
        total_size_bytes: totalSizeBytes,
        total_size_formatted: formatBytes(totalSizeBytes),
        all_backups_healthy: enrichedTables.every((t) => t.backup_is_fresh),
      },
      tables: enrichedTables,
    });
  } catch (err) {
    console.error("Environment fetch failed:", err.message);
    return res.status(500).json({ error: "Failed to retrieve environment status" });
  }
});

/**
 * POST /api/environment/reset
 * Resets table row counts and backups to seed defaults for easy demo repeats.
 */
router.post("/environment/reset", requireAuth, async (req, res) => {
  try {
    for (const item of BASELINE_ENVIRONMENT) {
      await prisma.mockEnvironment.upsert({
        where: { tableName: item.tableName },
        update: {
          rowCount: item.rowCount,
          lastBackupAt: item.lastBackupAt,
          metadata: item.metadata,
        },
        create: {
          tableName: item.tableName,
          rowCount: item.rowCount,
          lastBackupAt: item.lastBackupAt,
          metadata: item.metadata,
        },
      });
    }

    // Write audit log
    await prisma.auditLog.create({
      data: {
        entityType: "environment",
        entityId: "mock_environment",
        operation: "UPDATE",
        actor: "operator",
        changes: {
          action: "reset_to_demo_state",
          tables: BASELINE_ENVIRONMENT.map((b) => ({
            table: b.tableName,
            rows: b.rowCount,
          })),
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: "Target database state successfully restored to baseline.",
    });
  } catch (err) {
    console.error("Environment reset failed:", err.message);
    return res.status(500).json({ error: "Failed to reset environment state" });
  }
});

module.exports = router;

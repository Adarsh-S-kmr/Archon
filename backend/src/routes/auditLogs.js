const { Router } = require("express");
const prisma = require("../lib/prisma");

const router = Router();

/**
 * GET /api/audit-logs
 *
 * Returns the full audit trail, newest first.
 * Supports optional query filters:
 *   ?entity_type=action
 *   ?entity_id=<uuid>
 *   ?actor=policy_engine
 *   ?limit=50  (default 100, max 500)
 */
router.get("/audit-logs", async (req, res) => {
  try {
    const { entity_type, entity_id, actor, limit } = req.query;

    const where = {};
    if (entity_type) where.entityType = entity_type;
    if (entity_id) where.entityId = entity_id;
    if (actor) where.actor = actor;

    const take = Math.min(Number(limit) || 100, 500);

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take,
    });

    return res.status(200).json({
      success: true,
      count: logs.length,
      audit_logs: logs.map((log) => ({
        id: log.id,
        entity_type: log.entityType,
        entity_id: log.entityId,
        operation: log.operation,
        actor: log.actor,
        changes: log.changes,
        timestamp: log.timestamp,
      })),
    });
  } catch (err) {
    console.error("Audit log query failed:", err.message);
    return res.status(500).json({ error: "Failed to retrieve audit logs" });
  }
});

/**
 * GET /api/audit-logs/:entityId/trail
 *
 * Returns the full audit trail for a specific entity (action, task, execution),
 * ordered chronologically (oldest first) to show the pipeline progression.
 */
router.get("/audit-logs/:entityId/trail", async (req, res) => {
  try {
    const { entityId } = req.params;

    const logs = await prisma.auditLog.findMany({
      where: { entityId },
      orderBy: { timestamp: "asc" },
    });

    if (logs.length === 0) {
      return res.status(404).json({ error: `No audit trail found for entity ${entityId}` });
    }

    return res.status(200).json({
      success: true,
      entity_id: entityId,
      count: logs.length,
      trail: logs.map((log) => ({
        id: log.id,
        entity_type: log.entityType,
        operation: log.operation,
        actor: log.actor,
        changes: log.changes,
        timestamp: log.timestamp,
      })),
    });
  } catch (err) {
    console.error("Audit trail query failed:", err.message);
    return res.status(500).json({ error: "Failed to retrieve audit trail" });
  }
});

module.exports = router;

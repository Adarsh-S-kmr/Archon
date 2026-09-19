const { Router } = require("express");
const prisma = require("../lib/prisma");
const { evaluateAction, aggregateDecisions } = require("../lib/policyEngine");
const { computeBlastRadius } = require("../lib/blastRadius");

const router = Router();

// POST /api/actions/:id/evaluate

/**
 * Loads the action by ID, computes blast radius from mock_environment,
 * loads all active policies, runs evaluateAction() using real row counts,
 * writes decisions to policy_decisions, updates action status.
 */
router.post("/actions/:id/evaluate", async (req, res) => {
  const { id } = req.params;

  try {
    // Load the action
    const action = await prisma.action.findUnique({
      where: { id },
      include: { task: true },
    });

    if (!action) {
      return res.status(404).json({ error: `Action ${id} not found` });
    }

    if (action.status !== "pending") {
      return res.status(409).json({
        error: `Action ${id} has already been evaluated (status: ${action.status})`,
      });
    }

    // Load active policies
    const policies = await prisma.policy.findMany({
      where: { isActive: true },
    });

    if (policies.length === 0) {
      return res.status(500).json({
        error: "No active policies found — cannot evaluate action",
      });
    }

    // Compute blast radius from mock_environment
    const payload = action.payload || {};
    const blastRadius = await computeBlastRadius({
      action_type: action.type,
      target: payload.target,
      condition: payload.condition,
      environment: payload.environment,
      self_reported_rows_affected: payload.self_reported_rows_affected ?? payload.self_reported_rows ?? 0,
    });

    console.log(`Blast radius for action ${id}:`, JSON.stringify(blastRadius, null, 2));

    // Build action data using blast radius (overrides LLM self-report)
    const actionData = {
      action_type: action.type,
      target: payload.target,
      condition: payload.condition,
      environment: payload.environment,
      self_reported_rows_affected: blastRadius.estimated_rows,
      self_reported_risk: payload.self_reported_risk,
    };

    // Build context for policies that need backup info
    const context = {
      lastBackupAt: blastRadius.last_backup_at,
      rowCount: blastRadius.table_row_count,
    };

    console.log(`Evaluating action ${id}:`, JSON.stringify(actionData, null, 2));

    // Run the policy engine
    const decisions = evaluateAction(actionData, policies, context);
    const { finalDecision, triggeringPolicies } = aggregateDecisions(decisions);

    console.log(`Result: ${finalDecision} (${triggeringPolicies.length} policies triggered)`);

    // Persist decisions + update action status
    const result = await prisma.$transaction(async (tx) => {
      // Write each policy decision
      const savedDecisions = [];
      for (const d of decisions) {
        if (d.policyId) {
          const saved = await tx.policyDecision.create({
            data: {
              policyId: d.policyId,
              actionId: id,
              decision: d.decision === "REQUIRE_APPROVAL" ? "ESCALATE" : d.decision === "BLOCK" ? "DENY" : "ALLOW",
              reason: d.reason,
            },
          });
          savedDecisions.push(saved);
        }
      }

      // Map final decision to action status
      const statusMap = {
        ALLOW: "approved",
        BLOCK: "denied",
        REQUIRE_APPROVAL: "pending",
      };

      const updatedAction = await tx.action.update({
        where: { id },
        data: { status: statusMap[finalDecision] || "pending" },
      });

      // Audit log — evaluation step
      await tx.auditLog.create({
        data: {
          entityType: "action",
          entityId: id,
          operation: "UPDATE",
          actor: "policy_engine",
          changes: {
            step: "evaluate",
            evaluation: finalDecision,
            blast_radius: blastRadius,
            triggering_policies: triggeringPolicies.map((p) => p.policyName),
            previous_status: action.status,
            new_status: updatedAction.status,
          },
        },
      });

      return { savedDecisions, updatedAction };
    });

    return res.status(200).json({
      success: true,
      action_id: id,
      final_decision: finalDecision,
      action_status: result.updatedAction.status,
      blast_radius: blastRadius,
      decisions: decisions.map((d) => ({
        policy_id: d.policyId,
        policy_name: d.policyName,
        decision: d.decision,
        reason: d.reason,
      })),
      triggering_policies: triggeringPolicies.map((p) => ({
        policy_id: p.policyId,
        policy_name: p.policyName,
        decision: p.decision,
        reason: p.reason,
      })),
    });
  } catch (err) {
    console.error("Action evaluation failed:", err.message);
    return res.status(500).json({
      error: "Action evaluation failed",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

// POST /api/actions/:id/execute

/**
 * Execute an approved action:
 * - Checks action status is "approved"
 * - Mutates mock_environment (decrement row count for DELETE, etc.)
 * - Writes to executions table
 * - Writes to audit_logs
 */
router.post("/actions/:id/execute", async (req, res) => {
  const { id } = req.params;

  try {
    const action = await prisma.action.findUnique({
      where: { id },
      include: { task: true },
    });

    if (!action) {
      return res.status(404).json({ error: `Action ${id} not found` });
    }

    if (action.status !== "approved") {
      return res.status(409).json({
        error: `Action ${id} cannot be executed (status: ${action.status}). Only "approved" actions can be executed.`,
      });
    }

    // Compute blast radius for execution
    const payload = action.payload || {};
    const blastRadius = await computeBlastRadius({
      action_type: action.type,
      target: payload.target,
      condition: payload.condition,
      environment: payload.environment,
      self_reported_rows_affected: payload.self_reported_rows_affected ?? 0,
    });

    console.log(`Executing action ${id}: ${action.type} on ${payload.target}`);
    console.log(`  Estimated rows: ${blastRadius.estimated_rows}`);

    const startedAt = new Date();

    const result = await prisma.$transaction(async (tx) => {
      let executionResult = {};
      let newRowCount = null;

      const targetTable = (payload.target || "").toLowerCase().trim();
      const envRow = targetTable
        ? await tx.mockEnvironment.findUnique({ where: { tableName: targetTable } })
        : null;

      // Mutate mock_environment based on action type
      if (envRow) {
        const beforeRowCount = envRow.rowCount;

        switch (action.type) {
          case "DELETE": {
            newRowCount = Math.max(0, beforeRowCount - blastRadius.estimated_rows);
            await tx.mockEnvironment.update({
              where: { tableName: targetTable },
              data: { rowCount: newRowCount },
            });
            executionResult = {
              operation: "DELETE",
              target: targetTable,
              rows_before: beforeRowCount,
              rows_deleted: blastRadius.estimated_rows,
              rows_after: newRowCount,
            };
            break;
          }

          case "DROP": {
            newRowCount = 0;
            await tx.mockEnvironment.update({
              where: { tableName: targetTable },
              data: { rowCount: 0, metadata: { dropped: true, dropped_at: new Date().toISOString() } },
            });
            executionResult = {
              operation: "DROP",
              target: targetTable,
              rows_before: beforeRowCount,
              rows_after: 0,
            };
            break;
          }

          case "UPDATE": {
            newRowCount = beforeRowCount;
            executionResult = {
              operation: "UPDATE",
              target: targetTable,
              rows_affected: blastRadius.estimated_rows,
              rows_total: beforeRowCount,
            };
            break;
          }

          case "SCALE": {
            newRowCount = beforeRowCount * 2;
            await tx.mockEnvironment.update({
              where: { tableName: targetTable },
              data: { rowCount: newRowCount },
            });
            executionResult = {
              operation: "SCALE",
              target: targetTable,
              rows_before: beforeRowCount,
              rows_after: newRowCount,
            };
            break;
          }

          default:
            executionResult = { operation: action.type, note: "Unknown action type — no mock mutation" };
        }
      } else {
        executionResult = {
          operation: action.type,
          target: targetTable,
          note: "No mock_environment entry — simulated execution only",
          estimated_rows: blastRadius.estimated_rows,
        };
      }

      // Write execution record
      const execution = await tx.execution.create({
        data: {
          actionId: id,
          status: "success",
          startedAt,
          completedAt: new Date(),
          result: executionResult,
        },
      });

      // Update action status
      const updatedAction = await tx.action.update({
        where: { id },
        data: { status: "executed", executedAt: new Date() },
      });

      // Update task status
      if (action.task) {
        await tx.task.update({
          where: { id: action.taskId },
          data: { status: "completed" },
        });
      }

      // Audit log — execution step
      await tx.auditLog.create({
        data: {
          entityType: "action",
          entityId: id,
          operation: "UPDATE",
          actor: "executor",
          changes: {
            step: "execute",
            execution_id: execution.id,
            action_type: action.type,
            target: targetTable,
            blast_radius: blastRadius,
            result: executionResult,
            previous_status: action.status,
            new_status: updatedAction.status,
          },
        },
      });

      return { execution, updatedAction, executionResult };
    });

    console.log(`Execution ${result.execution.id} completed`);

    return res.status(200).json({
      success: true,
      action_id: id,
      execution_id: result.execution.id,
      action_status: result.updatedAction.status,
      blast_radius: blastRadius,
      result: result.executionResult,
    });
  } catch (err) {
    console.error("Execution failed:", err.message);

    try {
      await prisma.$transaction(async (tx) => {
        await tx.execution.create({
          data: {
            actionId: id,
            status: "failed",
            startedAt: new Date(),
            completedAt: new Date(),
            error: err.message,
          },
        });

        await tx.action.update({
          where: { id },
          data: { status: "failed" },
        });

        await tx.auditLog.create({
          data: {
            entityType: "action",
            entityId: id,
            operation: "UPDATE",
            actor: "executor",
            changes: {
              step: "execute_failed",
              error: err.message,
            },
          },
        });
      });
    } catch (_) {
      // Ignore cleanup errors
    }

    return res.status(500).json({
      error: "Execution failed",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

// PUT /api/actions/:id/patch-for-test (DEV ONLY)

router.put("/actions/:id/patch-for-test", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Test endpoint disabled in production" });
  }

  const { id } = req.params;
  const { type, payload } = req.body;

  try {
    const action = await prisma.action.findUnique({ where: { id } });
    if (!action) {
      return res.status(404).json({ error: `Action ${id} not found` });
    }

    const updateData = {};
    if (type) updateData.type = type;
    if (payload) updateData.payload = payload;
    updateData.status = "pending";

    const updated = await prisma.action.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json({ success: true, action: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

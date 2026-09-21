const { Router } = require("express");
const prisma = require("../lib/prisma");
const { parseTaskToAction } = require("../lib/gemini");

const router = Router();
function riskToPriority(risk) {
  const r = (risk || "").toLowerCase();
  if (r === "high" || r === "critical") return "high";
  if (r === "low") return "low";
  return "medium";
}


/**
 * GET /api/tasks
 *
 * Returns recent tasks with their latest action + policy decision,
 * joined for the Task Console's "Recent Tasks" list.
 *
 * Query params:
 *   ?limit=10  (default 10, max 50)
 */
router.get("/tasks", async (req, res) => {
  try {
    const take = Math.min(Number(req.query.limit) || 10, 50);

    const tasks = await prisma.task.findMany({
      orderBy: { createdAt: "desc" },
      take,
      include: {
        actions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            policyDecisions: {
              orderBy: { decidedAt: "desc" },
              take: 1,
              include: { policy: { select: { name: true } } },
            },
            executions: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    const result = tasks.map((t) => {
      const action = t.actions[0] || null;
      const decision = action?.policyDecisions[0] || null;
      const execution = action?.executions[0] || null;

      return {
        id: t.id,
        name: t.name,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt,
        action: action
          ? {
            id: action.id,
            type: action.type,
            status: action.status,
            target: action.payload?.target || null,
            environment: action.payload?.environment || null,
          }
          : null,
        decision: decision
          ? {
            decision: decision.decision,
            reason: decision.reason,
            policyName: decision.policy?.name || null,
          }
          : null,
        execution: execution
          ? {
            status: execution.status,
            completedAt: execution.completedAt,
          }
          : null,
      };
    });

    return res.status(200).json({ success: true, tasks: result });
  } catch (err) {
    console.error("Task list failed:", err.message);
    return res.status(500).json({ error: "Failed to retrieve tasks" });
  }
});

/**
 * POST /api/tasks
 * Accepts: { user_request: string }
 * 1. Calls Gemini to decompose the request into a structured action
 * 2. Creates a Task record
 * 3. Creates a linked Action record with the LLM-generated payload
 * 4. Returns both
 */
router.post("/tasks", async (req, res) => {
  const { user_request } = req.body;

  // Validate input
  if (!user_request || typeof user_request !== "string" || !user_request.trim()) {
    return res.status(400).json({
      error: "Missing or empty 'user_request' in request body",
    });
  }

  try {
    let actionData;
    let trimmed = user_request.trim();
    let isDirectJson = false;

    // Strip markdown code fences if provided (e.g. ```json { ... } ```)
    if (trimmed.startsWith("```")) {
      trimmed = trimmed.replace(/^```(?:json)?s*/i, "").replace(/s*```$/, "").trim();
    }

    // Auto-detect direct JSON payload (starts with { and ends with } or starts with {)
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      isDirectJson = true;
      let parsed = null;
      try {
        parsed = JSON.parse(trimmed);
      } catch (jsonErr) {
        // Attempt relaxed JSON parse (e.g., single quotes or trailing commas)
        try {
          parsed = Function('"use strict";return (' + trimmed + ')')();
        } catch (evalErr) {
          console.error("Direct JSON parse failed:", jsonErr.message);
          return res.status(400).json({
            error: `Invalid JSON format: ${jsonErr.message}. Direct JSON payloads are evaluated directly without Gemini, please provide valid JSON syntax.`,
            code: "INVALID_DIRECT_JSON",
          });
        }
      }

      if (!parsed || typeof parsed !== "object") {
        return res.status(400).json({
          error: "Provided JSON payload must be an object specifying action parameters.",
          code: "INVALID_DIRECT_JSON",
        });
      }

      // Normalize fields from direct JSON
      const action_type = String(parsed.action_type || parsed.actionType || parsed.type || "SELECT").toUpperCase();
      const target = String(parsed.target || parsed.table || parsed.target_table || "users").trim();
      const condition = parsed.condition !== undefined ? parsed.condition : (parsed.where !== undefined ? parsed.where : null);
      const environment = String(parsed.environment || parsed.env || "production").toLowerCase();
      const self_reported_rows = Number(
        parsed.self_reported_rows_affected ??
        parsed.self_reported_rows ??
        parsed.rows_affected ??
        parsed.rows ??
        0
      );
      const self_reported_risk = String(
        parsed.self_reported_risk ||
        parsed.risk ||
        (action_type === "DELETE" || action_type === "DROP" || action_type === "TRUNCATE" ? "high" : "medium")
      ).toLowerCase();

      actionData = {
        action_type,
        target,
        condition,
        environment,
        self_reported_rows_affected: self_reported_rows,
        self_reported_risk,
        is_direct_json: true,
      };

      console.log("⚡ [Direct JSON Mode] Bypassed Gemini LLM. Direct Action Data:", JSON.stringify(actionData));
    } else {
      // Call Gemini to parse natural language request
      console.log(`🤖 [Gemini LLM Planner] Parsing task: "${user_request.substring(0, 80)}..."`);
      actionData = await parseTaskToAction(trimmed);
      actionData.is_direct_json = false;
    }

    console.log("Execution Action Data:", JSON.stringify(actionData, null, 2));

    const taskName = isDirectJson && actionData.action_type && actionData.target
      ? `${actionData.action_type} → ${actionData.target} (${actionData.environment || "production"})`
      : trimmed.substring(0, 100);

    // Create Task + Action in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the task
      const task = await tx.task.create({
        data: {
          name: taskName,
          description: user_request.trim(),
          status: "pending",
          priority: riskToPriority(actionData.self_reported_risk),
        },
      });

      // Create the linked action
      const action = await tx.action.create({
        data: {
          taskId: task.id,
          type: actionData.action_type,
          payload: {
            target: actionData.target,
            condition: actionData.condition,
            environment: actionData.environment,
            self_reported_rows_affected: actionData.self_reported_rows_affected ?? actionData.self_reported_rows,
            self_reported_rows: actionData.self_reported_rows_affected ?? actionData.self_reported_rows,
            self_reported_risk: actionData.self_reported_risk,
            is_direct_json: isDirectJson,
            raw_request: user_request.trim(),
          },
          status: "pending",
        },
      });

      // Audit log — task creation (proposal step)
      await tx.auditLog.create({
        data: {
          entityType: "task",
          entityId: task.id,
          operation: "CREATE",
          actor: isDirectJson ? "direct_json_api" : "user",
          changes: {
            step: "proposal",
            user_request: user_request.trim(),
            action_type: actionData.action_type,
            target: actionData.target,
            is_direct_json: isDirectJson,
          },
        },
      });

      // Audit log — action creation (plan step)
      await tx.auditLog.create({
        data: {
          entityType: "action",
          entityId: action.id,
          operation: "CREATE",
          actor: isDirectJson ? "direct_payload" : "planner_agent",
          changes: {
            step: "plan",
            task_id: task.id,
            action_type: actionData.action_type,
            target: actionData.target,
            condition: actionData.condition,
            environment: actionData.environment,
            self_reported_rows: actionData.self_reported_rows_affected ?? actionData.self_reported_rows,
            self_reported_risk: actionData.self_reported_risk,
            is_direct_json: isDirectJson,
          },
        },
      });

      return { task, action };
    });

    console.log(`Task ${result.task.id} created with action ${result.action.id}`);

    // Return response
    return res.status(201).json({
      success: true,
      task: {
        id: result.task.id,
        name: result.task.name,
        status: result.task.status,
        priority: result.task.priority,
        createdAt: result.task.createdAt,
      },
      action: {
        id: result.action.id,
        type: result.action.type,
        payload: result.action.payload,
        status: result.action.status,
      },
      llm_parsed: actionData,
    });
  } catch (err) {
    console.error("Task creation failed:", err.message);

    // Distinguish LLM parse errors from DB errors
    const isParseError = err.message.includes("Failed to parse LLM JSON") ||
      err.message.includes("LLM response missing fields");

    const isGeminiOverload = err.message.includes("503") ||
      err.message.includes("429") ||
      err.message.includes("high demand") ||
      err.message.includes("quota");

    if (isGeminiOverload) {
      return res.status(503).json({
        error: "Gemini API is temporarily overloaded. This is a rate limit on Google's side, not a bug — please retry in a few seconds.",
        code: "LLM_OVERLOADED",
      });
    }

    return res.status(isParseError ? 422 : 500).json({
      error: isParseError ? "LLM returned invalid structured data" : "Internal server error",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

module.exports = router;

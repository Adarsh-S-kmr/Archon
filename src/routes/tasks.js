const { Router } = require("express");
const prisma = require("../lib/prisma");
const { parseTaskToAction } = require("../lib/gemini");

const router = Router();

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

  // ── Validate input ────────────────────────────────────────
  if (!user_request || typeof user_request !== "string" || !user_request.trim()) {
    return res.status(400).json({
      error: "Missing or empty 'user_request' in request body",
    });
  }

  try {
    // ── Step 1: Call Gemini to parse the request ────────────
    console.log(`\n📝 New task: "${user_request.substring(0, 80)}..."`);
    const actionData = await parseTaskToAction(user_request.trim());
    console.log("🤖 LLM returned:", JSON.stringify(actionData, null, 2));

    // ── Step 2: Create Task + Action in a transaction ───────
    const result = await prisma.$transaction(async (tx) => {
      // Create the task
      const task = await tx.task.create({
        data: {
          name: user_request.trim().substring(0, 100),
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
            raw_request: user_request.trim(),
          },
          status: "pending",
        },
      });

      // Create an audit log entry
      await tx.auditLog.create({
        data: {
          entityType: "task",
          entityId: task.id,
          operation: "CREATE",
          actor: "user",
          changes: {
            user_request: user_request.trim(),
            action_type: actionData.action_type,
            target: actionData.target,
          },
        },
      });

      return { task, action };
    });

    console.log(`✅ Task ${result.task.id} created with action ${result.action.id}`);

    // ── Step 3: Return response ─────────────────────────────
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
    console.error("❌ Task creation failed:", err.message);

    // Distinguish LLM parse errors from DB errors
    const isParseError = err.message.includes("Failed to parse LLM JSON") ||
                         err.message.includes("LLM response missing fields");

    return res.status(isParseError ? 422 : 500).json({
      error: isParseError ? "LLM returned invalid structured data" : "Internal server error",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

/**
 * Map risk level to task priority
 */
function riskToPriority(risk) {
  if (!risk) return "medium";
  const normalized = String(risk).toLowerCase();
  const allowed = ["low", "medium", "high", "critical"];
  return allowed.includes(normalized) ? normalized : "medium";
}

module.exports = router;

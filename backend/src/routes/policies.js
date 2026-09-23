const { Router } = require("express");
const prisma = require("../lib/prisma");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is not set. Server refusing to start with insecure defaults.");
}

const router = Router();

/**
 * Middleware: Enforces that the request has a valid JWT with the "approver" role.
 */
function requireApproverRole(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Authentication required. Please provide a valid authorization token.",
      code: "UNAUTHENTICATED",
    });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "approver") {
      return res.status(403).json({
        error: "Access denied. Only users with the 'approver' role can modify governance policies.",
        code: "FORBIDDEN_ROLE",
      });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      error: "Invalid or expired token.",
      code: "INVALID_TOKEN",
    });
  }
}


/**
 * GET /api/policies
 *
 * Returns all policies, ordered by creation date.
 * Used by the Policy Manager UI to display the editable table.
 */
router.get("/policies", async (req, res) => {
  try {
    const policies = await prisma.policy.findMany({
      orderBy: { createdAt: "asc" },
    });

    return res.status(200).json({
      success: true,
      policies: policies.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        rules: p.rules,
        isActive: p.isActive,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    });
  } catch (err) {
    console.error("Policy list failed:", err.message);
    return res.status(500).json({ error: "Failed to retrieve policies" });
  }
});

/**
 * PUT /api/policies/:id
 *
 * Updates a policy's editable fields: description, rules, isActive.
 * Name is not editable (it's the policy identifier used in code).
 *
 * Body: { description?, rules?, isActive? }
 */
router.put("/policies/:id", requireApproverRole, async (req, res) => {
  const { id } = req.params;
  const { description, rules, isActive } = req.body;

  try {
    const existing = await prisma.policy.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Policy not found" });
    }

    const updateData = {};
    if (description !== undefined) updateData.description = description;
    if (rules !== undefined) updateData.rules = rules;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updated = await prisma.policy.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json({
      success: true,
      policy: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        rules: updated.rules,
        isActive: updated.isActive,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (err) {
    console.error("Policy update failed:", err.message);
    return res.status(500).json({ error: "Failed to update policy" });
  }
});

module.exports = router;

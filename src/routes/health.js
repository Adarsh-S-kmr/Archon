const { Router } = require("express");
const prisma = require("../lib/prisma");

const router = Router();

router.get("/health", async (_req, res) => {
  const timestamp = new Date().toISOString();

  try {
    // Verify Prisma can reach Postgres
    await prisma.$queryRaw`SELECT 1`;

    return res.json({
      status: "ok",
      timestamp,
      database: "connected",
      uptime: process.uptime(),
    });
  } catch (err) {
    console.error("Health check — DB unreachable:", err.message);

    return res.status(503).json({
      status: "error",
      timestamp,
      database: "disconnected",
      error: err.message,
    });
  }
});

module.exports = router;

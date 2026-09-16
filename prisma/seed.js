const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...\n");

  // ── Mock Environment ──────────────────────────────────────────
  console.log("  → mock_environment");

  await prisma.mockEnvironment.upsert({
    where: { tableName: "users" },
    update: { rowCount: 12421, lastBackupAt: new Date("2026-09-14T03:00:00Z") },
    create: {
      tableName: "users",
      rowCount: 12421,
      lastBackupAt: new Date("2026-09-14T03:00:00Z"),
      metadata: {
        description: "Application user accounts",
        columns: ["id", "email", "name", "role", "created_at", "last_login"],
        avgRowSizeBytes: 256,
        indexCount: 3,
      },
    },
  });

  await prisma.mockEnvironment.upsert({
    where: { tableName: "orders" },
    update: { rowCount: 45231, lastBackupAt: new Date("2026-09-14T03:15:00Z") },
    create: {
      tableName: "orders",
      rowCount: 45231,
      lastBackupAt: new Date("2026-09-14T03:15:00Z"),
      metadata: {
        description: "Customer order records",
        columns: ["id", "user_id", "total", "status", "created_at", "shipped_at"],
        avgRowSizeBytes: 512,
        indexCount: 5,
      },
    },
  });

  console.log("    ✓ users:  12,421 rows  (backup: 2026-09-14T03:00Z)");
  console.log("    ✓ orders: 45,231 rows  (backup: 2026-09-14T03:15Z)");

  // ── Sample Policies ───────────────────────────────────────────
  console.log("\n  → policies");

  const readOnlyPolicy = await prisma.policy.upsert({
    where: { name: "read-only-default" },
    update: {},
    create: {
      name: "read-only-default",
      description: "Default policy: allow reads, deny writes unless escalated",
      rules: [
        { action: "query", effect: "ALLOW" },
        { action: "mutation", effect: "DENY", reason: "Write ops require approval" },
      ],
      isActive: true,
    },
  });

  await prisma.policy.upsert({
    where: { name: "admin-full-access" },
    update: {},
    create: {
      name: "admin-full-access",
      description: "Admin policy: allow all operations",
      rules: [{ action: "*", effect: "ALLOW" }],
      isActive: true,
    },
  });

  console.log("    ✓ read-only-default");
  console.log("    ✓ admin-full-access");

  // ── Sample Task + Action + Execution chain ────────────────────
  console.log("\n  → tasks, actions, executions");

  const task = await prisma.task.create({
    data: {
      name: "Fetch user metrics",
      description: "Retrieve aggregated user statistics from the users table",
      status: "completed",
      priority: "medium",
    },
  });

  const action = await prisma.action.create({
    data: {
      taskId: task.id,
      type: "query",
      payload: { sql: "SELECT COUNT(*) FROM users", target: "mock_environment" },
      status: "executed",
      executedAt: new Date(),
    },
  });

  await prisma.policyDecision.create({
    data: {
      policyId: readOnlyPolicy.id,
      actionId: action.id,
      decision: "ALLOW",
      reason: "Read query permitted by read-only-default policy",
    },
  });

  await prisma.execution.create({
    data: {
      actionId: action.id,
      status: "success",
      completedAt: new Date(),
      result: { count: 12421 },
    },
  });

  console.log("    ✓ task: Fetch user metrics");
  console.log("    ✓ action: query (executed)");
  console.log("    ✓ policy_decision: ALLOW");
  console.log("    ✓ execution: success");

  // ── Audit Logs ────────────────────────────────────────────────
  console.log("\n  → audit_logs");

  await prisma.auditLog.createMany({
    data: [
      {
        entityType: "task",
        entityId: task.id,
        operation: "CREATE",
        actor: "system",
        changes: { name: "Fetch user metrics", status: "pending" },
      },
      {
        entityType: "task",
        entityId: task.id,
        operation: "UPDATE",
        actor: "system",
        changes: { status: { from: "pending", to: "completed" } },
      },
      {
        entityType: "action",
        entityId: action.id,
        operation: "CREATE",
        actor: "system",
        changes: { type: "query", status: "pending" },
      },
    ],
  });

  console.log("    ✓ 3 audit log entries");

  console.log("\n✅ Seed complete!\n");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log(" Seeding database...\n");

  // Mock Environment
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

  // sessions has a fresh backup so production-destructive-approval can be tested in isolation
  await prisma.mockEnvironment.upsert({
    where: { tableName: "sessions" },
    update: { rowCount: 8340, lastBackupAt: new Date(Date.now() - 1 * 60 * 60 * 1000) }, // 1 hour ago
    create: {
      tableName: "sessions",
      rowCount: 8340,
      lastBackupAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
      metadata: {
        description: "Active user sessions",
        columns: ["id", "user_id", "token", "expires_at", "created_at"],
        avgRowSizeBytes: 128,
        indexCount: 2,
      },
    },
  });

  console.log("    users:    12,421 rows  (backup: 2026-09-14T03:00Z)");
  console.log("    orders:   45,231 rows  (backup: 2026-09-14T03:15Z)");
  console.log("    sessions:  8,340 rows  (backup: ~1h ago)");

  // 5 Core Interceptor Policies
  console.log("\n  → policies (5 interceptor rules)");

  const policy1 = await prisma.policy.upsert({
    where: { name: "no-unbounded-destructive" },
    update: {
      description: "BLOCK DELETE/DROP operations that have no WHERE condition",
      rules: [
        {
          match: { action_type: ["DELETE", "DROP"], condition: null },
          effect: "BLOCK",
        },
      ],
      isActive: true,
    },
    create: {
      name: "no-unbounded-destructive",
      description: "BLOCK DELETE/DROP operations that have no WHERE condition",
      rules: [
        {
          match: { action_type: ["DELETE", "DROP"], condition: null },
          effect: "BLOCK",
        },
      ],
      isActive: true,
    },
  });
  console.log("    no-unbounded-destructive");

  const policy2 = await prisma.policy.upsert({
    where: { name: "max-rows-threshold" },
    update: {
      description: "BLOCK any operation reporting > 5,000 estimated rows affected",
      rules: [
        {
          match: { self_reported_rows_affected: { gt: 5000 } },
          effect: "BLOCK",
        },
      ],
      isActive: true,
    },
    create: {
      name: "max-rows-threshold",
      description: "BLOCK any operation reporting > 5,000 estimated rows affected",
      rules: [
        {
          match: { self_reported_rows_affected: { gt: 5000 } },
          effect: "BLOCK",
        },
      ],
      isActive: true,
    },
  });
  console.log("    max-rows-threshold (> 5,000 rows)");

  const policy3 = await prisma.policy.upsert({
    where: { name: "production-destructive-approval" },
    update: {
      description: "REQUIRE_APPROVAL for DELETE/DROP in production environment",
      rules: [
        {
          match: { environment: "production", action_type: ["DELETE", "DROP"] },
          effect: "REQUIRE_APPROVAL",
        },
      ],
      isActive: true,
    },
    create: {
      name: "production-destructive-approval",
      description: "REQUIRE_APPROVAL for DELETE/DROP in production environment",
      rules: [
        {
          match: { environment: "production", action_type: ["DELETE", "DROP"] },
          effect: "REQUIRE_APPROVAL",
        },
      ],
      isActive: true,
    },
  });
  console.log("    production-destructive-approval");

  const policy4 = await prisma.policy.upsert({
    where: { name: "no-backup-destructive" },
    update: {
      description: "BLOCK destructive operations if no recent backup exists (< 24h)",
      rules: [
        {
          match: { action_type: ["DELETE", "DROP"], backup_age_hours: { gt: 24 } },
          effect: "BLOCK",
        },
      ],
      isActive: true,
    },
    create: {
      name: "no-backup-destructive",
      description: "BLOCK destructive operations if no recent backup exists (< 24h)",
      rules: [
        {
          match: { action_type: ["DELETE", "DROP"], backup_age_hours: { gt: 24 } },
          effect: "BLOCK",
        },
      ],
      isActive: true,
    },
  });
  console.log("    no-backup-destructive (24h freshness)");

  const policy5 = await prisma.policy.upsert({
    where: { name: "scope-violation" },
    update: {
      description: "BLOCK operations targeting tables outside the allowed list",
      rules: [
        {
          match: { target: { not_in: ["users", "orders", "sessions", "logs", "products"] } },
          effect: "BLOCK",
        },
      ],
      isActive: true,
    },
    create: {
      name: "scope-violation",
      description: "BLOCK operations targeting tables outside the allowed list",
      rules: [
        {
          match: { target: { not_in: ["users", "orders", "sessions", "logs", "products"] } },
          effect: "BLOCK",
        },
      ],
      isActive: true,
    },
  });
  console.log("    scope-violation (allowed: users, orders, sessions, logs, products)");

  // Clean up old placeholder policies that are no longer used
  await prisma.policy.deleteMany({
    where: {
      name: { in: ["read-only-default", "admin-full-access"] },
    },
  });

  // Sample Task + Action + Execution chain
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
      policyId: policy1.id,
      actionId: action.id,
      decision: "ALLOW",
      reason: "Read query — no destructive policy triggered",
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

  console.log("    task: Fetch user metrics");
  console.log("    action: query (executed)");
  console.log("    policy_decision: ALLOW");
  console.log("    execution: success");

  //Audit Logs
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

  console.log("3 audit log entries");

  console.log("\nSeed complete!\n");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

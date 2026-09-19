const { PrismaClient } = require("@prisma/client"); //singleton client instance to manage pooling connection with PostgreSQL

const globalForPrisma = globalThis; // prevents hot-reload from spawning extra connections

const prisma =
  globalForPrisma.__prisma // use this if already has a prisma client 
  ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}

module.exports = prisma;

require("dotenv").config({ quiet: true });

// module imports
const express = require("express"); // HTTP webserver
const cors = require("cors"); //Cross origin Resource Sharing

const healthRouter = require("./routes/health");
const authRouter = require("./routes/auth");
const tasksRouter = require("./routes/tasks");
const actionsRouter = require("./routes/actions");
const policiesRouter = require("./routes/policies");
const auditLogsRouter = require("./routes/auditLogs");
const environmentRouter = require("./routes/environment");

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware 
app.use(cors());
app.use(express.json());

// Routes 
app.use("/api", healthRouter);
app.use("/api", authRouter);
app.use("/api", tasksRouter);
app.use("/api", actionsRouter);
app.use("/api", policiesRouter);
app.use("/api", auditLogsRouter);
app.use("/api", environmentRouter);

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error from index" });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n ARCHON server running on http://localhost:${PORT}`);
  console.log(` Health check: http://localhost:${PORT}/api/health\n`);
});

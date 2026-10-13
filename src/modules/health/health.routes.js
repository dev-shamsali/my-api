import { Router, sendSuccess, AppError } from "@rheajs/core";
import { pingDatabase } from "../../config/database.js";

const healthRouter = Router();

// Liveness: the process is up.
healthRouter.get("/", (_req, res) => sendSuccess(res, { status: "ok", uptime: process.uptime() }));

// Readiness: dependencies are reachable. Point load balancer / orchestrator readiness probes here.
healthRouter.get("/ready", async (_req, res) => {
  if (!(await pingDatabase())) throw new AppError(503, "NOT_READY", "Database is not reachable", { expose: true });
  sendSuccess(res, { status: "ready", database: "up" });
});

export { healthRouter };

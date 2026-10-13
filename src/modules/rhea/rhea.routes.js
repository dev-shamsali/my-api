import { Router, sendSuccess } from "@rheajs/core";
import { env } from "../../config/env.js";

function info() {
  return {
    name: "Rhea.js",
    message: "Rhea.js is running. This is your first API.",
    developedBy: "Shams Ali Shaikh",
    environment: env.NODE_ENV,
    node: process.version,
    endpoints: { rhea: "/api/rhea", health: "/health", ready: "/health/ready" },
    docs: "https://rhea.devcodehub.cloud/docs/introduction/",
  };
}

const rheaRouter = Router();
rheaRouter.get("/", (_req, res) => sendSuccess(res, info(), "Hello from Rhea.js"));

const welcomeRouter = Router();
welcomeRouter.get("/", (_req, res) => sendSuccess(res, info(), "Welcome to Rhea.js"));

export { rheaRouter, welcomeRouter };

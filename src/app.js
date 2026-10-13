import { createApp } from "@rheajs/core";

import { env } from "./config/env.js";
import { modules } from "./modules/index.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { ensureUserStore } from "./modules/auth/auth.repository.js";

function buildApp() {
  const app = createApp({
    env: env.NODE_ENV,
    logger: { level: env.LOG_LEVEL },
    cors: { origin: env.CORS_ORIGIN },
    trustProxy: env.TRUST_PROXY > 0 ? env.TRUST_PROXY : false,
    // MongoDB: refuse bodies with $-operator keys such as {"$ne": null}, the classic login bypass.
    rejectOperatorKeys: true,
  });

  // Connect before listening (startup fails clearly if the database is down) and close after the server stops.
  app.hook("beforeStart", async () => {
    await connectDatabase(app.logger);
    await ensureUserStore();
  });
  app.hook("afterShutdown", () => disconnectDatabase());

  for (const m of modules) app.mount(m.path, m.router);
  return app;
}

export { buildApp };

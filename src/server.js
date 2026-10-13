import { buildApp } from "./app.js";
import { env } from "./config/env.js";

const app = buildApp();

app.start(env.PORT).then(
  () => {
    if (env.NODE_ENV === "production") return;
    const url = `http://localhost:${env.PORT}`;
    console.log(`\n  Rhea.js  |  developed by Shams Ali Shaikh\n\n  Local:  ${url}\n  Try:    ${url}/api/rhea\n`);
  },
  (err) => {
    app.logger.fatal({ err }, "failed to start");
    process.exit(1);
  },
);

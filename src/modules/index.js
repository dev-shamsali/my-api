import { healthRouter } from "./health/health.routes.js";
import { rheaRouter, welcomeRouter } from "./rhea/rhea.routes.js";
import { authRouter } from "./auth/auth.routes.js";
// rhea:imports

const modules = [
  { path: "/", router: welcomeRouter },
  { path: "/api/rhea", router: rheaRouter },
  { path: "/health", router: healthRouter },
  { path: "/api/auth", router: authRouter },
  // rhea:modules
];

export { modules };

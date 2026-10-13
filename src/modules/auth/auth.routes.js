import { Router, UnauthorizedError, rateLimiter, sendSuccess, validate } from "@rheajs/core";

import { assertAllowedOrigin, authenticate, clearRefreshCookie, noStore, readCookie, setRefreshCookie } from "@rheajs/auth";

import { authCookie, authServiceDeps, jwt } from "../../config/auth.js";
import { createAuthService } from "./auth.service.js";
import { userRepository } from "./auth.repository.js";
import { loginSchema, refreshSchema, registerSchema } from "./auth.schema.js";

/** Builds the auth routes. Passing the service, the token signer and the cookie settings in keeps the routes testable without a database. */
function createAuthRouter(service, tokens, cookie) {
  const router = Router();
  const cookieOptions = { secure: cookie.secure, maxAgeSec: cookie.maxAgeSec };
  // Slow down password guessing and mass sign-ups. Counters are per process: pass a shared store to rateLimiter() when you run several instances.
  const attempts = { limit: 10, windowMs: 15 * 60_000 };
  const refreshes = { limit: 60, windowMs: 15 * 60_000 };

  // Tokens must never be stored by a browser, proxy or CDN.
  router.use(noStore);

  /** Sends a session. In cookie mode the refresh token goes into the cookie and out of the JSON. */
  function send(res, result, message, status = 200) {
    const { refreshToken, ...body } = result;
    if (cookie.enabled) {
      setRefreshCookie(res, refreshToken, cookieOptions);
      return sendSuccess(res, body, message, status);
    }
    return sendSuccess(res, result, message, status);
  }

  /** Finds the refresh token the way the mode says. In cookie mode the request must also come from an allowed origin (CSRF). */
  function refreshTokenOf(req) {
    if (cookie.enabled) {
      assertAllowedOrigin(req, cookie.allowedOrigins);
      const fromCookie = readCookie(req);
      if (!fromCookie) throw new UnauthorizedError("Invalid refresh token", { code: "REFRESH_INVALID" });
      return fromCookie;
    }
    return req.body.refreshToken;
  }

  const tokenRoute = cookie.enabled ? [] : [validate(refreshSchema)];

  router.post("/register", rateLimiter(attempts), validate(registerSchema), async (req, res) =>
    send(res, await service.register(req.body), "Registered", 201),
  );

  router.post("/login", rateLimiter(attempts), validate(loginSchema), async (req, res) => {
    try {
      return send(res, await service.login(req.body), "Logged in");
    } catch (err) {
      // Matched by code, not by class, so it also works when a bundler or test runner loads the service twice.
      const locked = err;
      if (locked.code === "ACCOUNT_LOCKED" && typeof locked.retryAfterSec === "number") res.setHeader("Retry-After", String(locked.retryAfterSec));
      throw err;
    }
  });

  router.post("/refresh", rateLimiter(refreshes), ...tokenRoute, async (req, res) => {
    try {
      return send(res, await service.refresh(refreshTokenOf(req)), "Refreshed");
    } catch (err) {
      // A cookie that no longer works is cleared, so the browser stops sending it.
      if (cookie.enabled) clearRefreshCookie(res, cookieOptions);
      throw err;
    }
  });

  router.post("/logout", rateLimiter(refreshes), ...tokenRoute, async (req, res) => {
    await service.logout(refreshTokenOf(req));
    if (cookie.enabled) clearRefreshCookie(res, cookieOptions);
    res.status(204).end();
  });

  router.post("/logout-all", authenticate(tokens), async (req, res) => {
    await service.logoutAll(req.user.id);
    if (cookie.enabled) clearRefreshCookie(res, cookieOptions);
    res.status(204).end();
  });

  router.get("/me", authenticate(tokens), async (req, res) => sendSuccess(res, await service.me(req.user.id)));
  return router;
}

const authRouter = createAuthRouter(createAuthService(userRepository, authServiceDeps), jwt, authCookie);

export { authRouter, createAuthRouter };

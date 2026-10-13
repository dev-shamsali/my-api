import { createJwt, createLockout, createRefreshTokens } from "@rheajs/auth";
import { env } from "./env.js";
import { refreshStore } from "../modules/auth/auth.refresh-store.js";

/** Signs and verifies access tokens. The secret comes from JWT_SECRET (at least 32 characters). */
const jwt = createJwt({
  secret: env.JWT_SECRET,
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
  expiresIn: env.JWT_EXPIRES_IN,
});

/** Refresh tokens: random, stored hashed, rotated on every use. Reusing an old one ends the whole session. */
const refresh = createRefreshTokens({
  store: refreshStore,
  idleSec: env.REFRESH_TOKEN_IDLE_DAYS * 86_400,
  maxSec: env.REFRESH_TOKEN_MAX_DAYS * 86_400,
});

/** 5 wrong passwords lock an account for 15 minutes. */
const lockout = createLockout({ maxFailures: 5, lockSec: 900 });

if (env.AUTH_REFRESH_COOKIE && env.CORS_ORIGIN.length === 0)
  throw new Error("AUTH_REFRESH_COOKIE=true needs CORS_ORIGIN: the browser origins allowed to call /api/auth/refresh.");

/** AUTH_REFRESH_COOKIE=true keeps the refresh token in an httpOnly cookie that page scripts cannot read. */
const authCookie = {
  enabled: env.AUTH_REFRESH_COOKIE,
  secure: env.NODE_ENV === "production",
  maxAgeSec: env.REFRESH_TOKEN_IDLE_DAYS * 86_400,
  allowedOrigins: env.CORS_ORIGIN,
};

const authServiceDeps = { jwt, refresh, lockout };

export { jwt, refresh, lockout, authCookie, authServiceDeps };

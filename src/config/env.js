import { baseEnvShape, loadEnv, z } from "@rheajs/core";

// Validated at startup. If anything is missing or invalid the app prints every problem and exits.
const env = loadEnv({
  ...baseEnvShape,
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  DATABASE_URL: z.string().regex(/^mongodb(\+srv)?:\/\//, "must start with mongodb:// or mongodb+srv://"),
  JWT_SECRET: z.string().min(32, "must be at least 32 characters. Generate one with: openssl rand -base64 48"),
  JWT_ISSUER: z.string().min(1).default("my-api"),
  JWT_AUDIENCE: z.string().min(1).default("my-api-clients"),
  JWT_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/, "use a number and a unit, for example 15m or 1h").default("15m"),
  REFRESH_TOKEN_IDLE_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  REFRESH_TOKEN_MAX_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  // true: the refresh token lives in an httpOnly cookie (browsers). false: it is returned in the JSON body (mobile apps, scripts).
  AUTH_REFRESH_COOKIE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
});

export { env };

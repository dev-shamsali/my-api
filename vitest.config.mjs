import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,js,mjs}"],
    env: { DATABASE_URL: "mongodb://127.0.0.1:27017/test", JWT_SECRET: "test-only-value-test-only-value-test-only-value-" },
    coverage: { provider: "v8", include: ["src/**"] },
  },
});

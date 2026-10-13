import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";

describe("health", () => {
  let app;
  beforeAll(async () => {
    app = await buildApp().ready();
  });

  it("GET /health is alive", async () => {
    const res = await request(app.express).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
  });

  it("GET /health/ready is 503 until the database is connected", async () => {
    // Tests do not start the server, so no database connection exists.
    const res = await request(app.express).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("NOT_READY");
  });
});

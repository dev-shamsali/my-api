import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";

describe("Rhea.js first API", () => {
  let app;
  beforeAll(async () => {
    app = await buildApp().ready();
  });

  it("GET /api/rhea identifies the framework and its developer", async () => {
    const res = await request(app.express).get("/api/rhea");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("Rhea.js");
    expect(res.body.data.developedBy).toBe("Shams Ali Shaikh");
  });

  it("GET / welcomes", async () => {
    const res = await request(app.express).get("/");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Welcome to Rhea.js");
  });

  it("sends security headers and a request id, and hides the framework header", async () => {
    const res = await request(app.express).get("/api/rhea");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("returns the standard error shape for unknown routes", async () => {
    const res = await request(app.express).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

import { randomUUID } from "node:crypto";
import { createApp } from "@rheajs/core";
import { createJwt, createLockout, createMemoryRefreshStore, createRefreshTokens } from "@rheajs/auth";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuthRouter } from "../../src/modules/auth/auth.routes.js";
import { createAuthService } from "../../src/modules/auth/auth.service.js";

// In-memory users and refresh tokens, so these tests need no database. A low hashing cost keeps them fast: never do that in real code.
function memoryRepository() {
  const users = [];
  return {
    async findByEmail(email) {
      return users.find((u) => u.email === email) ?? null;
    },
    async findById(id) {
      return users.find((u) => u.id === id) ?? null;
    },
    async create({ email, passwordHash, roles }) {
      const user = { id: randomUUID(), email, passwordHash, roles, createdAt: new Date(), failedLogins: 0, lockedUntil: null };
      users.push(user);
      return user;
    },
    async updatePasswordHash(id, passwordHash) {
      const u = users.find((x) => x.id === id);
      if (u) u.passwordHash = passwordHash;
    },
    async saveLockout(id, state) {
      const u = users.find((x) => x.id === id);
      if (u) Object.assign(u, state);
    },
  };
}

const jwt = createJwt({ secret: "t".repeat(40), issuer: "test", audience: "test-clients" });
const pw = "a-long-test-" + "pass";
const wrongPw = "not-the-" + "right-one";
const good = { email: "Ada@Example.com", password: pw };

async function build(cookie = { enabled: false, secure: false, maxAgeSec: 604800, allowedOrigins: [] }) {
  const service = createAuthService(memoryRepository(), {
    jwt,
    // graceSec 0: a replayed token counts as theft at once, so the test does not have to wait for the 10 second window.
    refresh: createRefreshTokens({ store: createMemoryRefreshStore(), graceSec: 0 }),
    lockout: createLockout(),
    password: { cost: 1024 },
  });
  const app = createApp({ env: "test" });
  app.mount("/api/auth", createAuthRouter(service, jwt, cookie));
  return app.ready();
}
const post = (app, path, body = {}) => request(app.express).post("/api/auth" + path).send(body);

describe("auth: register, login and tokens", () => {
  let app;
  beforeEach(async () => {
    app = await build();
  });

  it("registers, normalises the email and never returns the password hash", async () => {
    const res = await post(app, "/register", good);
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe("ada@example.com");
    expect(res.body.data.user.roles).toEqual(["user"]);
    expect(res.body.data.tokenType).toBe("Bearer");
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toHaveLength(43);
    expect(JSON.stringify(res.body)).not.toMatch(/scrypt|passwordHash|failedLogins/);
  });

  it("never lets a browser or proxy keep a token response", async () => {
    const res = await post(app, "/register", good);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("rejects a duplicate email with 409, weak input with 422, and common passwords", async () => {
    await post(app, "/register", good);
    expect((await post(app, "/register", good)).body.error.code).toBe("EMAIL_TAKEN");
    expect((await post(app, "/register", { email: "x@example.com", password: "short" })).status).toBe(422);
    expect((await post(app, "/register", { email: "not-an-email", password: pw })).status).toBe(422);
    const common = await post(app, "/register", { email: "y@example.com", password: "password123456" });
    expect(common.status).toBe(422);
    expect(JSON.stringify(common.body)).toMatch(/too common/);
  });

  it("logs in and the access token unlocks /me", async () => {
    await post(app, "/register", good);
    const login = await post(app, "/login", { email: "ada@example.com", password: pw });
    expect(login.status).toBe(200);
    const me = await request(app.express).get("/api/auth/me").set("Authorization", `Bearer ${login.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe("ada@example.com");
  });

  it("gives the same 401 for a wrong password and an unknown email", async () => {
    await post(app, "/register", good);
    const wrong = await post(app, "/login", { email: "ada@example.com", password: wrongPw });
    const unknown = await post(app, "/login", { email: "nobody@example.com", password: wrongPw });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toEqual({ ...unknown.body.error, requestId: wrong.body.error.requestId });
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("protects /me", async () => {
    expect((await request(app.express).get("/api/auth/me")).status).toBe(401);
    expect((await request(app.express).get("/api/auth/me").set("Authorization", "Bearer not.a.token")).status).toBe(401);
  });
});

describe("auth: refresh tokens", () => {
  let app;
  let first;
  beforeEach(async () => {
    app = await build();
    first = (await post(app, "/register", good)).body.data;
  });

  it("trades a refresh token for new tokens, and the old refresh token stops working", async () => {
    const next = await post(app, "/refresh", { refreshToken: first.refreshToken });
    expect(next.status).toBe(200);
    expect(next.body.data.refreshToken).not.toBe(first.refreshToken);
    expect(next.body.data.accessToken).toBeTruthy();
    expect((await post(app, "/refresh", { refreshToken: next.body.data.refreshToken })).status).toBe(200);
  });

  it("treats a replayed old token as theft and ends the whole session", async () => {
    const next = await post(app, "/refresh", { refreshToken: first.refreshToken });
    expect(next.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    const replay = await post(app, "/refresh", { refreshToken: first.refreshToken });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("REFRESH_REUSED");
    // the thief and the owner are both signed out: the newest token died with the family
    const newest = await post(app, "/refresh", { refreshToken: next.body.data.refreshToken });
    expect(newest.status).toBe(401);
    expect(newest.body.error.code).toBe("REFRESH_INVALID");
  });

  it("rejects missing, malformed and unknown refresh tokens", async () => {
    expect((await post(app, "/refresh", {})).status).toBe(422);
    expect((await post(app, "/refresh", { refreshToken: "short" })).status).toBe(422);
    const unknown = await post(app, "/refresh", { refreshToken: "a".repeat(43) });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.code).toBe("REFRESH_INVALID");
  });

  it("logout ends the session and can be repeated", async () => {
    expect((await post(app, "/logout", { refreshToken: first.refreshToken })).status).toBe(204);
    expect((await post(app, "/logout", { refreshToken: first.refreshToken })).status).toBe(204);
    expect((await post(app, "/refresh", { refreshToken: first.refreshToken })).body.error.code).toBe("REFRESH_INVALID");
  });

  it("logout-all ends every session of the user", async () => {
    const second = (await post(app, "/login", { email: "ada@example.com", password: pw })).body.data;
    const out = await request(app.express).post("/api/auth/logout-all").set("Authorization", `Bearer ${second.accessToken}`);
    expect(out.status).toBe(204);
    expect((await post(app, "/refresh", { refreshToken: first.refreshToken })).status).toBe(401);
    expect((await post(app, "/refresh", { refreshToken: second.refreshToken })).status).toBe(401);
    expect((await request(app.express).post("/api/auth/logout-all")).status).toBe(401);
  });
});

describe("auth: account lockout", () => {
  it("locks an account after 5 wrong passwords, even for the right password, with Retry-After", async () => {
    const app = await build();
    await post(app, "/register", good);
    for (let i = 0; i < 5; i++) expect((await post(app, "/login", { email: "ada@example.com", password: wrongPw })).status).toBe(401);
    const locked = await post(app, "/login", { email: "ada@example.com", password: pw });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("ACCOUNT_LOCKED");
    expect(Number(locked.headers["retry-after"])).toBeGreaterThan(800);
  });

  it("a correct password resets the count", async () => {
    const app = await build();
    await post(app, "/register", good);
    for (let i = 0; i < 4; i++) await post(app, "/login", { email: "ada@example.com", password: wrongPw });
    expect((await post(app, "/login", { email: "ada@example.com", password: pw })).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await post(app, "/login", { email: "ada@example.com", password: wrongPw })).status).toBe(401);
  });
});

describe("auth: cookie mode", () => {
  const origin = "https://app.example.com";
  const cookieMode = { enabled: true, secure: true, maxAgeSec: 604800, allowedOrigins: [origin] };
  const cookieOf = (res) => String(res.headers["set-cookie"]?.[0] ?? "");

  it("keeps the refresh token out of the JSON and in an httpOnly cookie", async () => {
    const app = await build(cookieMode);
    const res = await post(app, "/register", good);
    expect(res.body.data.refreshToken).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/rhea_refresh/);
    const c = cookieOf(res);
    for (const flag of ["rhea_refresh=", "HttpOnly", "SameSite=Strict", "Secure", "Path=/api/auth"]) expect(c).toContain(flag);
  });

  it("refresh needs the cookie and an allowed Origin (CSRF check)", async () => {
    const app = await build(cookieMode);
    const cookie = cookieOf(await post(app, "/register", good)).split(";")[0];
    const call = (headers) => request(app.express).post("/api/auth/refresh").set(headers);
    expect((await call({ Cookie: cookie })).status).toBe(403);
    expect((await call({ Cookie: cookie, Origin: "https://evil.example" })).body.error.code).toBe("CSRF_ORIGIN");
    const ok = await call({ Cookie: cookie, Origin: origin });
    expect(ok.status).toBe(200);
    expect(ok.body.data.accessToken).toBeTruthy();
    expect(cookieOf(ok)).toContain("rhea_refresh=");
    // the old cookie value is spent
    expect((await call({ Cookie: cookie, Origin: origin })).status).toBe(401);
  });

  it("ignores a refresh token sent in the body, and logout clears the cookie", async () => {
    const app = await build(cookieMode);
    const reg = await post(app, "/register", good);
    const cookie = cookieOf(reg).split(";")[0];
    const bodyOnly = await request(app.express).post("/api/auth/refresh").set("Origin", origin).send({ refreshToken: "a".repeat(43) });
    expect(bodyOnly.status).toBe(401);
    const out = await request(app.express).post("/api/auth/logout").set({ Cookie: cookie, Origin: origin });
    expect(out.status).toBe(204);
    expect(cookieOf(out)).toContain("Max-Age=0");
  });
});

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, PASSWORD, testDatabaseUrl, WEB_ORIGIN } from "./helpers.js";

describe.skipIf(!testDatabaseUrl)("auth", () => {
  const ctx = createTestContext();

  beforeEach(() => ctx.resetDatabase());
  afterAll(() => ctx.close());

  it("registers a user with an httpOnly SameSite session cookie", async () => {
    const res = await ctx
      .agent()
      .post("/api/v1/auth/register")
      .send({ name: "Ana", email: "Ana@Example.com", password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: "Ana", email: "ana@example.com" });
    expect(res.body.user.passwordHash).toBeUndefined();

    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("stores the password as an Argon2id hash and the session token hashed", async () => {
    const agent = await ctx.registeredAgent("Ana", "ana@example.com");
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: "ana@example.com" } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);

    const me = await agent.get("/api/v1/auth/me");
    expect(me.status).toBe(200);
    const session = await ctx.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a duplicate email", async () => {
    await ctx.registeredAgent("Ana", "ana@example.com");
    const res = await ctx
      .agent()
      .post("/api/v1/auth/register")
      .send({ name: "Ana 2", email: "ana@example.com", password: PASSWORD });
    expect(res.status).toBe(409);
  });

  it("returns field errors for invalid input", async () => {
    const res = await ctx
      .agent()
      .post("/api/v1/auth/register")
      .send({ name: "A", email: "not-an-email", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["name", "email", "password"]));
  });

  it("uses the same generic error for a wrong password and an unknown email", async () => {
    await ctx.registeredAgent("Ana", "ana@example.com");
    const wrongPassword = await ctx
      .agent()
      .post("/api/v1/auth/login")
      .send({ email: "ana@example.com", password: "wrong-password-123" });
    const unknownEmail = await ctx
      .agent()
      .post("/api/v1/auth/login")
      .send({ email: "nobody@example.com", password: "wrong-password-123" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it("invalidates the session on logout", async () => {
    const agent = await ctx.registeredAgent("Ana", "ana@example.com");
    expect((await agent.get("/api/v1/auth/me")).status).toBe(200);

    expect((await agent.post("/api/v1/auth/logout")).status).toBe(204);
    expect((await agent.get("/api/v1/auth/me")).status).toBe(401);
    expect(await ctx.prisma.session.count()).toBe(0);
  });

  it("blocks state-changing requests from another origin (CSRF)", async () => {
    const noOrigin = await request(ctx.app)
      .post("/api/v1/auth/login")
      .send({ email: "ana@example.com", password: PASSWORD });
    expect(noOrigin.status).toBe(403);
    expect(noOrigin.body.error.code).toBe("CSRF_ORIGIN_MISMATCH");

    const evilOrigin = await request(ctx.app)
      .post("/api/v1/auth/login")
      .set("Origin", "https://evil.example")
      .send({ email: "ana@example.com", password: PASSWORD });
    expect(evilOrigin.status).toBe(403);

    const sameOrigin = await request(ctx.app)
      .post("/api/v1/auth/login")
      .set("Origin", WEB_ORIGIN)
      .send({ email: "ana@example.com", password: PASSWORD });
    expect(sameOrigin.status).toBe(401);
  });

  it("sends security headers", async () => {
    const res = await ctx.agent().get("/api/v1/auth/me");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });
});

describe.skipIf(!testDatabaseUrl)("auth rate limiting", () => {
  const ctx = createTestContext({ RATE_LIMIT_AUTH_MAX: "3" });

  beforeEach(() => ctx.resetDatabase());
  afterAll(() => ctx.close());

  it("returns 429 after too many login attempts", async () => {
    const attempt = () =>
      ctx
        .agent()
        .post("/api/v1/auth/login")
        .send({ email: "ana@example.com", password: "wrong-password-123" });

    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
  });
});

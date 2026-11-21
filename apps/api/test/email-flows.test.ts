import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, PASSWORD, testDatabaseUrl, tokenFromEmail } from "./helpers.js";

describe.skipIf(!testDatabaseUrl)("email verification and password reset", () => {
  const ctx = createTestContext();

  beforeEach(() => ctx.resetDatabase());
  afterAll(() => ctx.close());

  async function lastEmail(to: string) {
    await ctx.queue.onIdle();
    return ctx.mailer.lastTo(to);
  }

  it("sends a verification email on registration and verifies with the link", async () => {
    const agent = await ctx.registeredAgent("Ana", "ana@example.com", { verified: false });
    expect((await agent.get("/api/v1/auth/me")).body.user.emailVerified).toBe(false);

    const email = await lastEmail("ana@example.com");
    expect(email?.subject).toContain("Verify");
    // The token travels in the URL fragment, never in the query string.
    expect(email?.text).toMatch(/\/verify-email#token=/);

    const token = tokenFromEmail(email?.text);
    expect((await ctx.agent().post("/api/v1/auth/verify-email").send({ token })).status).toBe(204);
    expect((await agent.get("/api/v1/auth/me")).body.user.emailVerified).toBe(true);

    // Single use.
    const again = await ctx.agent().post("/api/v1/auth/verify-email").send({ token });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("INVALID_TOKEN");
  });

  it("invalidates the previous verification link when a new one is requested", async () => {
    const agent = await ctx.registeredAgent("Ana", "ana@example.com", { verified: false });
    const first = tokenFromEmail((await lastEmail("ana@example.com"))?.text);

    expect((await agent.post("/api/v1/auth/resend-verification")).status).toBe(204);
    const second = tokenFromEmail((await lastEmail("ana@example.com"))?.text);
    expect(second).not.toBe(first);

    const old = await ctx.agent().post("/api/v1/auth/verify-email").send({ token: first });
    expect(old.status).toBe(400);
    const fresh = await ctx.agent().post("/api/v1/auth/verify-email").send({ token: second });
    expect(fresh.status).toBe(204);
  });

  it("does not reveal whether an email has an account", async () => {
    await ctx.registeredAgent("Ana", "ana@example.com");
    ctx.mailer.clear();

    const known = await ctx
      .agent()
      .post("/api/v1/auth/forgot-password")
      .send({ email: "ana@example.com" });
    const unknown = await ctx
      .agent()
      .post("/api/v1/auth/forgot-password")
      .send({ email: "nobody@example.com" });

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);

    await ctx.queue.onIdle();
    // Let the post-response work finish before checking the outbox.
    await new Promise((resolve) => setTimeout(resolve, 200));
    await ctx.queue.onIdle();
    expect(ctx.mailer.sent.map((m) => m.to)).toEqual(["ana@example.com"]);
  });

  it("resets the password, logs out every session and notifies the user", async () => {
    const agent = await ctx.registeredAgent("Ana", "ana@example.com");
    await ctx.agent().post("/api/v1/auth/forgot-password").send({ email: "ana@example.com" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const token = tokenFromEmail((await lastEmail("ana@example.com"))?.text);

    const newPassword = "a-brand-new-long-password";
    const reset = await ctx
      .agent()
      .post("/api/v1/auth/reset-password")
      .send({ token, password: newPassword });
    expect(reset.status).toBe(204);

    // The existing session is gone.
    expect((await agent.get("/api/v1/auth/me")).status).toBe(401);
    expect((await lastEmail("ana@example.com"))?.subject).toContain("password was changed");

    const oldLogin = await ctx
      .agent()
      .post("/api/v1/auth/login")
      .send({ email: "ana@example.com", password: PASSWORD });
    expect(oldLogin.status).toBe(401);
    const newLogin = await ctx
      .agent()
      .post("/api/v1/auth/login")
      .send({ email: "ana@example.com", password: newPassword });
    expect(newLogin.status).toBe(200);

    const reuse = await ctx
      .agent()
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "yet-another-long-password" });
    expect(reuse.status).toBe(400);
  });

  it("rejects expired reset links", async () => {
    await ctx.registeredAgent("Ana", "ana@example.com");
    await ctx.agent().post("/api/v1/auth/forgot-password").send({ email: "ana@example.com" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const token = tokenFromEmail((await lastEmail("ana@example.com"))?.text);

    await ctx.prisma.emailToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await ctx
      .agent()
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "a-brand-new-long-password" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });

  it("emails invitations and requires a verified email to accept them", async () => {
    const owner = await ctx.registeredAgent("Owner", "owner@example.com");
    const org = await owner.post("/api/v1/orgs").send({ name: "Studio" });
    const orgId = org.body.organization.id;

    await owner
      .post(`/api/v1/orgs/${orgId}/invitations`)
      .send({ email: "new@example.com", role: "MEMBER" });
    const invitationEmail = await lastEmail("new@example.com");
    expect(invitationEmail?.subject).toContain("Studio");
    const token = tokenFromEmail(invitationEmail?.text);

    const invited = await ctx.registeredAgent("New", "new@example.com", { verified: false });
    const blocked = await invited.post(`/api/v1/invitations/${token}/accept`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("EMAIL_NOT_VERIFIED");

    await ctx.prisma.user.update({
      where: { email: "new@example.com" },
      data: { emailVerifiedAt: new Date() },
    });
    expect((await invited.post(`/api/v1/invitations/${token}/accept`)).status).toBe(200);
  });

  it("escapes user-provided names in HTML emails", async () => {
    const owner = await ctx.registeredAgent("Owner", "owner@example.com");
    const org = await owner.post("/api/v1/orgs").send({ name: '<img src=x onerror="alert(1)">' });
    await owner
      .post(`/api/v1/orgs/${org.body.organization.id}/invitations`)
      .send({ email: "new@example.com", role: "MEMBER" });

    const email = await lastEmail("new@example.com");
    expect(email?.html).not.toContain("<img");
    expect(email?.html).toContain("&lt;img");
  });
});

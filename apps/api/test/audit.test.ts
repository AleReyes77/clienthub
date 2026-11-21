import type { Agent } from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, testDatabaseUrl, tokenFromEmail } from "./helpers.js";

describe.skipIf(!testDatabaseUrl)("audit log", () => {
  const ctx = createTestContext();
  let owner: Agent;
  let member: Agent;
  let orgId: string;

  beforeEach(async () => {
    await ctx.resetDatabase();
    owner = await ctx.registeredAgent("Owner", "owner@example.com");
    member = await ctx.registeredAgent("Member", "member@example.com");
    orgId = (await owner.post("/api/v1/orgs").send({ name: "Studio" })).body.organization.id;

    await owner
      .post(`/api/v1/orgs/${orgId}/invitations`)
      .send({ email: "member@example.com", role: "MEMBER" });
    await ctx.queue.onIdle();
    const token = tokenFromEmail(ctx.mailer.lastTo("member@example.com")?.text);
    await member.post(`/api/v1/invitations/${token}/accept`);
  });

  afterAll(() => ctx.close());

  it("records who did what, newest first", async () => {
    const project = await owner.post(`/api/v1/orgs/${orgId}/projects`).send({ name: "Website" });
    await owner.delete(`/api/v1/orgs/${orgId}/projects/${project.body.project.id}`);

    const res = await owner.get(`/api/v1/orgs/${orgId}/audit-logs`);
    expect(res.status).toBe(200);
    expect(res.body.entries.map((e: { action: string }) => e.action)).toEqual([
      "project.deleted",
      "project.created",
      "member.joined",
      "invitation.created",
      "organization.created",
    ]);

    const deleted = res.body.entries[0];
    expect(deleted.actor.name).toBe("Owner");
    expect(deleted.metadata).toMatchObject({ name: "Website" });
    // IP addresses are stored but never exposed through the API.
    expect(deleted.ip).toBeUndefined();
  });

  it("is only visible to owners and admins", async () => {
    expect((await member.get(`/api/v1/orgs/${orgId}/audit-logs`)).status).toBe(403);
  });

  it("paginates with a cursor", async () => {
    await ctx.prisma.auditLog.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        organizationId: orgId,
        action: "task.created",
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      })),
    });

    const first = await owner.get(`/api/v1/orgs/${orgId}/audit-logs`);
    expect(first.body.entries).toHaveLength(50);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await owner.get(
      `/api/v1/orgs/${orgId}/audit-logs?cursor=${first.body.nextCursor}`,
    );
    const ids = new Set([
      ...first.body.entries.map((e: { id: string }) => e.id),
      ...second.body.entries.map((e: { id: string }) => e.id),
    ]);
    // 60 seeded + 3 from setup, no duplicates across pages.
    expect(ids.size).toBe(63);
    expect(second.body.nextCursor).toBeNull();
  });

  it("rejects a tampered cursor", async () => {
    const res = await owner.get(`/api/v1/orgs/${orgId}/audit-logs?cursor=not-a-cursor`);
    expect(res.status).toBe(400);
  });
});

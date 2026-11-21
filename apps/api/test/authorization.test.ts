import type { Agent } from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, testDatabaseUrl } from "./helpers.js";

/**
 * These tests check the RBAC rules and that no endpoint leaks data
 * from another organization or another client (IDOR).
 */
describe.skipIf(!testDatabaseUrl)("authorization", () => {
  const ctx = createTestContext();

  let owner: Agent;
  let member: Agent;
  let client: Agent;
  let otherClient: Agent;
  let outsider: Agent;
  let orgId: string;
  let clientProjectId: string;
  let internalProjectId: string;

  async function invite(email: string, role: string, as: Agent) {
    const res = await owner.post(`/api/v1/orgs/${orgId}/invitations`).send({ email, role });
    expect(res.status).toBe(201);
    const accepted = await as.post(`/api/v1/invitations/${res.body.invitation.token}/accept`);
    expect(accepted.status).toBe(200);
    return accepted.body.organization.membershipId as string;
  }

  beforeEach(async () => {
    await ctx.resetDatabase();

    owner = await ctx.registeredAgent("Owner", "owner@example.com");
    member = await ctx.registeredAgent("Member", "member@example.com");
    client = await ctx.registeredAgent("Client", "client@example.com");
    otherClient = await ctx.registeredAgent("Other client", "other@example.com");
    outsider = await ctx.registeredAgent("Outsider", "outsider@example.com");

    const org = await owner.post("/api/v1/orgs").send({ name: "Studio" });
    orgId = org.body.organization.id;

    await invite("member@example.com", "MEMBER", member);
    const clientMembershipId = await invite("client@example.com", "CLIENT", client);
    await invite("other@example.com", "CLIENT", otherClient);

    const clientProject = await owner
      .post(`/api/v1/orgs/${orgId}/projects`)
      .send({ name: "Client website", clientMembershipId });
    clientProjectId = clientProject.body.project.id;

    const internal = await owner.post(`/api/v1/orgs/${orgId}/projects`).send({ name: "Internal" });
    internalProjectId = internal.body.project.id;
  });

  afterAll(() => ctx.prisma.$disconnect());

  it("requires a session", async () => {
    const res = await ctx.agent().get(`/api/v1/orgs/${orgId}/projects`);
    expect(res.status).toBe(401);
  });

  it("returns 404 (not 403) to users outside the organization", async () => {
    expect((await outsider.get(`/api/v1/orgs/${orgId}`)).status).toBe(404);
    expect((await outsider.get(`/api/v1/orgs/${orgId}/projects/${clientProjectId}`)).status).toBe(
      404,
    );
  });

  it("does not leak projects through another organization's URL (IDOR)", async () => {
    const otherOrg = await outsider.post("/api/v1/orgs").send({ name: "Other org" });
    const otherOrgId = otherOrg.body.organization.id;

    const res = await outsider.get(`/api/v1/orgs/${otherOrgId}/projects/${clientProjectId}`);
    expect(res.status).toBe(404);
    const tasks = await outsider.get(
      `/api/v1/orgs/${otherOrgId}/projects/${clientProjectId}/tasks`,
    );
    expect(tasks.status).toBe(404);
  });

  it("shows a client only the projects where they are the client", async () => {
    const res = await client.get(`/api/v1/orgs/${orgId}/projects`);
    expect(res.status).toBe(200);
    expect(res.body.projects.map((p: { id: string }) => p.id)).toEqual([clientProjectId]);

    expect((await client.get(`/api/v1/orgs/${orgId}/projects/${internalProjectId}`)).status).toBe(
      404,
    );
    expect((await otherClient.get(`/api/v1/orgs/${orgId}/projects`)).body.projects).toEqual([]);
  });

  it("gives clients read-only access", async () => {
    const createTask = await client
      .post(`/api/v1/orgs/${orgId}/projects/${clientProjectId}/tasks`)
      .send({ title: "Sneaky task" });
    expect(createTask.status).toBe(403);

    expect((await client.get(`/api/v1/orgs/${orgId}/members`)).status).toBe(403);
    expect(
      (await client.get(`/api/v1/orgs/${orgId}/projects/${clientProjectId}/tasks`)).status,
    ).toBe(200);
  });

  it("lets members manage tasks but not projects or people", async () => {
    const task = await member
      .post(`/api/v1/orgs/${orgId}/projects/${internalProjectId}/tasks`)
      .send({ title: "Write copy", dueDate: "2026-12-15" });
    expect(task.status).toBe(201);
    expect(task.body.task.dueDate).toBe("2026-12-15");

    const done = await member
      .patch(`/api/v1/orgs/${orgId}/projects/${internalProjectId}/tasks/${task.body.task.id}`)
      .send({ status: "DONE" });
    expect(done.status).toBe(200);
    expect(done.body.task.status).toBe("DONE");

    expect(
      (await member.post(`/api/v1/orgs/${orgId}/projects`).send({ name: "New project" })).status,
    ).toBe(403);
    expect(
      (
        await member
          .post(`/api/v1/orgs/${orgId}/invitations`)
          .send({ email: "x@example.com", role: "MEMBER" })
      ).status,
    ).toBe(403);
  });

  it("does not let a task be moved into a project through the URL of another project", async () => {
    const task = await owner
      .post(`/api/v1/orgs/${orgId}/projects/${internalProjectId}/tasks`)
      .send({ title: "Internal task" });
    const res = await owner
      .patch(`/api/v1/orgs/${orgId}/projects/${clientProjectId}/tasks/${task.body.task.id}`)
      .send({ status: "DONE" });
    expect(res.status).toBe(404);
  });

  it("rejects clients as task assignees and non-clients as project clients", async () => {
    const members = await owner.get(`/api/v1/orgs/${orgId}/members`);
    const byEmail = (email: string) =>
      members.body.members.find((m: { user: { email: string } }) => m.user.email === email)
        .membershipId;

    const badAssignee = await owner
      .post(`/api/v1/orgs/${orgId}/projects/${internalProjectId}/tasks`)
      .send({ title: "Task", assigneeMembershipId: byEmail("client@example.com") });
    expect(badAssignee.status).toBe(400);

    const badClient = await owner
      .post(`/api/v1/orgs/${orgId}/projects`)
      .send({ name: "Project", clientMembershipId: byEmail("member@example.com") });
    expect(badClient.status).toBe(400);
  });

  it("only lets an invitation be accepted by the invited email, once", async () => {
    const res = await owner
      .post(`/api/v1/orgs/${orgId}/invitations`)
      .send({ email: "new@example.com", role: "MEMBER" });
    const token = res.body.invitation.token;

    expect((await outsider.post(`/api/v1/invitations/${token}/accept`)).status).toBe(403);

    const invited = await ctx.registeredAgent("New", "new@example.com");
    expect((await invited.post(`/api/v1/invitations/${token}/accept`)).status).toBe(200);
    expect((await invited.post(`/api/v1/invitations/${token}/accept`)).status).toBe(410);
  });

  it("stops admins from changing owners and members from changing their own role", async () => {
    const admin = await ctx.registeredAgent("Admin", "admin@example.com");
    await invite("admin@example.com", "ADMIN", admin);

    const members = await owner.get(`/api/v1/orgs/${orgId}/members`);
    const find = (email: string) =>
      members.body.members.find((m: { user: { email: string } }) => m.user.email === email)
        .membershipId;

    const demoteOwner = await admin
      .patch(`/api/v1/orgs/${orgId}/members/${find("owner@example.com")}`)
      .send({ role: "MEMBER" });
    expect(demoteOwner.status).toBe(403);

    const selfPromote = await admin
      .patch(`/api/v1/orgs/${orgId}/members/${find("admin@example.com")}`)
      .send({ role: "OWNER" });
    expect(selfPromote.status).toBe(403);

    const promoteMember = await admin
      .patch(`/api/v1/orgs/${orgId}/members/${find("member@example.com")}`)
      .send({ role: "ADMIN" });
    expect(promoteMember.status).toBe(204);
  });
});

import { readdir } from "node:fs/promises";
import path from "node:path";
import type { Agent } from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, testDatabaseUrl } from "./helpers.js";

/** 1×1 transparent PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n");
const HTML = Buffer.from("<html><body><script>alert(document.cookie)</script></body></html>");
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name));
}

describe.skipIf(!testDatabaseUrl)("project files", () => {
  const ctx = createTestContext({ MAX_UPLOAD_MB: "1" });
  let owner: Agent;
  let member: Agent;
  let client: Agent;
  let outsider: Agent;
  let orgId: string;
  let clientProjectId: string;
  let internalProjectId: string;

  async function invite(email: string, role: string, as: Agent) {
    const res = await owner.post(`/api/v1/orgs/${orgId}/invitations`).send({ email, role });
    const accepted = await as.post(`/api/v1/invitations/${res.body.invitation.token}/accept`);
    return accepted.body.organization.membershipId as string;
  }

  const filesUrl = (projectId: string) => `/api/v1/orgs/${orgId}/projects/${projectId}/files`;

  function upload(as: Agent, projectId: string, buffer: Buffer, filename: string) {
    return as.post(filesUrl(projectId)).attach("file", buffer, { filename });
  }

  beforeEach(async () => {
    await ctx.resetDatabase();
    owner = await ctx.registeredAgent("Owner", "owner@example.com");
    member = await ctx.registeredAgent("Member", "member@example.com");
    client = await ctx.registeredAgent("Client", "client@example.com");
    outsider = await ctx.registeredAgent("Outsider", "outsider@example.com");
    orgId = (await owner.post("/api/v1/orgs").send({ name: "Studio" })).body.organization.id;

    await invite("member@example.com", "MEMBER", member);
    const clientMembershipId = await invite("client@example.com", "CLIENT", client);

    clientProjectId = (
      await owner
        .post(`/api/v1/orgs/${orgId}/projects`)
        .send({ name: "Client site", clientMembershipId })
    ).body.project.id;
    internalProjectId = (
      await owner.post(`/api/v1/orgs/${orgId}/projects`).send({ name: "Internal" })
    ).body.project.id;
  });

  afterAll(() => ctx.close());

  it("uploads, lists and downloads a file as an attachment", async () => {
    const res = await upload(member, clientProjectId, PNG, "logo.png");
    expect(res.status).toBe(201);
    expect(res.body.file).toMatchObject({
      name: "logo.png",
      contentType: "image/png",
      size: PNG.length,
    });
    expect(res.body.file.uploadedBy.name).toBe("Member");

    const list = await client.get(filesUrl(clientProjectId));
    expect(list.body.files).toHaveLength(1);

    const download = await client
      .get(`${filesUrl(clientProjectId)}/${res.body.file.id}/download`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (chunk: Buffer) => chunks.push(chunk));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toBe("image/png");
    expect(download.headers["content-disposition"]).toMatch(/^attachment; filename="?logo\.png"?$/);
    expect(download.headers["x-content-type-options"]).toBe("nosniff");
    expect(download.headers["content-security-policy"]).toContain("sandbox");
    expect(Buffer.compare(download.body as Buffer, PNG)).toBe(0);
  });

  it("detects the real type from the content, not the name", async () => {
    const pdfNamedPng = await upload(member, internalProjectId, PDF, "report.png");
    expect(pdfNamedPng.status).toBe(201);
    expect(pdfNamedPng.body.file.contentType).toBe("application/pdf");

    const textNamedPng = await upload(member, internalProjectId, Buffer.from("hi"), "photo.png");
    expect(textNamedPng.status).toBe(415);
  });

  it("rejects HTML and SVG, and stores HTML-looking text only as plain text", async () => {
    expect((await upload(member, internalProjectId, HTML, "page.html")).status).toBe(415);
    expect((await upload(member, internalProjectId, SVG, "logo.svg")).status).toBe(415);

    const disguised = await upload(member, internalProjectId, HTML, "notes.txt");
    expect(disguised.status).toBe(201);
    expect(disguised.body.file.contentType).toBe("text/plain; charset=utf-8");
  });

  it("rejects files over the size limit and empty files", async () => {
    const big = Buffer.alloc(1024 * 1024 + 1, 0x61);
    expect((await upload(member, internalProjectId, big, "big.txt")).status).toBe(413);
    expect((await upload(member, internalProjectId, Buffer.alloc(0), "empty.txt")).status).toBe(
      400,
    );
  });

  it("never uses the uploaded name as a storage path", async () => {
    const res = await upload(member, internalProjectId, Buffer.from("x"), "../../etc/passwd.txt");
    expect(res.status).toBe(201);
    expect(res.body.file.name).toBe("passwd.txt");

    const stored = await listFiles(ctx.uploadDir);
    expect(stored).toHaveLength(1);
    expect(stored[0]).not.toContain("passwd");
    expect(path.resolve(stored[0] ?? "")).toContain(path.resolve(ctx.uploadDir));
  });

  it("keeps clients and outsiders out of projects they cannot see", async () => {
    const internalFile = (await upload(member, internalProjectId, PNG, "secret.png")).body.file;

    expect((await client.get(filesUrl(internalProjectId))).status).toBe(404);
    expect(
      (await client.get(`${filesUrl(internalProjectId)}/${internalFile.id}/download`)).status,
    ).toBe(404);
    // Reaching the file through a project the client CAN see does not work either.
    expect(
      (await client.get(`${filesUrl(clientProjectId)}/${internalFile.id}/download`)).status,
    ).toBe(404);
    expect((await upload(outsider, internalProjectId, PNG, "x.png")).status).toBe(404);
  });

  it("lets clients upload to their own project", async () => {
    const res = await upload(client, clientProjectId, PDF, "brief.pdf");
    expect(res.status).toBe(201);
    expect((await upload(client, internalProjectId, PDF, "brief.pdf")).status).toBe(404);
  });

  it("only lets uploaders, owners and admins delete files, and removes the bytes", async () => {
    const file = (await upload(member, clientProjectId, PNG, "logo.png")).body.file;
    const url = `${filesUrl(clientProjectId)}/${file.id}`;

    expect((await client.delete(url)).status).toBe(403);
    expect(await listFiles(ctx.uploadDir)).toHaveLength(1);

    expect((await owner.delete(url)).status).toBe(204);
    await ctx.queue.onIdle();
    expect(await listFiles(ctx.uploadDir)).toHaveLength(0);

    const audit = await owner.get(`/api/v1/orgs/${orgId}/audit-logs`);
    expect(audit.body.entries[0]).toMatchObject({ action: "file.deleted" });
  });

  it("removes the stored files when the project is deleted", async () => {
    await upload(member, internalProjectId, PNG, "a.png");
    await upload(member, internalProjectId, PDF, "b.pdf");
    expect(await listFiles(ctx.uploadDir)).toHaveLength(2);

    expect((await owner.delete(`/api/v1/orgs/${orgId}/projects/${internalProjectId}`)).status).toBe(
      204,
    );
    await ctx.queue.onIdle();
    expect(await listFiles(ctx.uploadDir)).toHaveLength(0);
  });
});

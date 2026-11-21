import { createProjectSchema, updateProjectSchema } from "@clienthub/shared";
import { Router } from "express";
import type { PrismaClient } from "../../lib/prisma.js";
import type { JobQueue } from "../../lib/queue.js";
import { parse } from "../../lib/validate.js";
import { authorize, getMembership } from "../../middleware/membership.js";
import type { AuditService } from "../audit/audit.service.js";
import { createProjectsService } from "./projects.service.js";

/** Mounted under `/orgs/:orgId`. Read access is filtered per role inside the service. */
export function projectsRouter(prisma: PrismaClient, audit: AuditService, queue: JobQueue) {
  const router = Router();
  const projects = createProjectsService(prisma);

  router.get("/projects", async (req, res) => {
    res.json({ projects: await projects.list(getMembership(req)) });
  });

  router.post("/projects", async (req, res) => {
    const membership = authorize(req, "projects:create");
    const input = parse(createProjectSchema, req.body);
    const project = await projects.create(membership, input);
    await audit.recordFromRequest(req, {
      action: "project.created",
      targetType: "project",
      targetId: project.id,
      metadata: { name: project.name },
    });
    res.status(201).json({ project });
  });

  router.get("/projects/:projectId", async (req, res) => {
    res.json({ project: await projects.get(getMembership(req), req.params.projectId) });
  });

  router.patch("/projects/:projectId", async (req, res) => {
    const membership = authorize(req, "projects:update");
    const input = parse(updateProjectSchema, req.body);
    const project = await projects.update(membership, req.params.projectId, input);
    await audit.recordFromRequest(req, {
      action: "project.updated",
      targetType: "project",
      targetId: project.id,
      metadata: { name: project.name, changes: Object.keys(input) },
    });
    res.json({ project });
  });

  router.delete("/projects/:projectId", async (req, res) => {
    const membership = authorize(req, "projects:delete");
    const { name, storageKeys } = await projects.remove(membership, req.params.projectId);
    // The database rows are gone (cascade); the file bytes are removed in the background.
    if (storageKeys.length > 0) await queue.enqueue("storage.delete", { keys: storageKeys });
    await audit.recordFromRequest(req, {
      action: "project.deleted",
      targetType: "project",
      targetId: req.params.projectId,
      metadata: { name, files: storageKeys.length },
    });
    res.status(204).end();
  });

  return router;
}

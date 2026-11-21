import { createProjectSchema, updateProjectSchema } from "@clienthub/shared";
import { Router } from "express";
import type { PrismaClient } from "../../lib/prisma.js";
import { parse } from "../../lib/validate.js";
import { authorize, getMembership } from "../../middleware/membership.js";
import { createProjectsService } from "./projects.service.js";

/** Mounted under `/orgs/:orgId`. Read access is filtered per role inside the service. */
export function projectsRouter(prisma: PrismaClient) {
  const router = Router();
  const projects = createProjectsService(prisma);

  router.get("/projects", async (req, res) => {
    res.json({ projects: await projects.list(getMembership(req)) });
  });

  router.post("/projects", async (req, res) => {
    const membership = authorize(req, "projects:create");
    const input = parse(createProjectSchema, req.body);
    res.status(201).json({ project: await projects.create(membership, input) });
  });

  router.get("/projects/:projectId", async (req, res) => {
    res.json({ project: await projects.get(getMembership(req), req.params.projectId) });
  });

  router.patch("/projects/:projectId", async (req, res) => {
    const membership = authorize(req, "projects:update");
    const input = parse(updateProjectSchema, req.body);
    res.json({ project: await projects.update(membership, req.params.projectId, input) });
  });

  router.delete("/projects/:projectId", async (req, res) => {
    const membership = authorize(req, "projects:delete");
    await projects.remove(membership, req.params.projectId);
    res.status(204).end();
  });

  return router;
}

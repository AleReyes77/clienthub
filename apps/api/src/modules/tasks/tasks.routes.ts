import { createTaskSchema, updateTaskSchema } from "@clienthub/shared";
import { Router } from "express";
import type { PrismaClient } from "../../lib/prisma.js";
import { parse } from "../../lib/validate.js";
import { authorize, getMembership } from "../../middleware/membership.js";
import { createTasksService } from "./tasks.service.js";

/** Mounted under `/orgs/:orgId`. Project visibility is checked inside the service. */
export function tasksRouter(prisma: PrismaClient) {
  const router = Router();
  const tasks = createTasksService(prisma);

  router.get("/projects/:projectId/tasks", async (req, res) => {
    res.json({ tasks: await tasks.list(getMembership(req), req.params.projectId) });
  });

  router.post("/projects/:projectId/tasks", async (req, res) => {
    const membership = authorize(req, "tasks:create");
    const input = parse(createTaskSchema, req.body);
    res.status(201).json({ task: await tasks.create(membership, req.params.projectId, input) });
  });

  router.patch("/projects/:projectId/tasks/:taskId", async (req, res) => {
    const membership = authorize(req, "tasks:update");
    const input = parse(updateTaskSchema, req.body);
    const { projectId, taskId } = req.params;
    res.json({ task: await tasks.update(membership, projectId, taskId, input) });
  });

  router.delete("/projects/:projectId/tasks/:taskId", async (req, res) => {
    const membership = authorize(req, "tasks:delete");
    await tasks.remove(membership, req.params.projectId, req.params.taskId);
    res.status(204).end();
  });

  return router;
}

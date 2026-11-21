import { createTaskSchema, type TaskDto, updateTaskSchema } from "@clienthub/shared";
import { type Request, Router } from "express";
import type { PrismaClient } from "../../lib/prisma.js";
import { parse } from "../../lib/validate.js";
import { getAuth } from "../../middleware/auth.js";
import { authorize, getMembership } from "../../middleware/membership.js";
import type { AuditService } from "../audit/audit.service.js";
import type { Notifier } from "../notifications/notifier.js";
import { createTasksService } from "./tasks.service.js";

/** Mounted under `/orgs/:orgId`. Project visibility is checked inside the service. */
export function tasksRouter(prisma: PrismaClient, audit: AuditService, notifier: Notifier) {
  const router = Router();
  const tasks = createTasksService(prisma);

  /** Emails the assignee, unless they assigned the task to themselves. */
  async function notifyAssignee(req: Request, task: TaskDto) {
    const membership = getMembership(req);
    if (!task.assignee || task.assignee.membershipId === membership.id) return;

    const assignee = await prisma.membership.findUnique({
      where: { id: task.assignee.membershipId },
      select: { user: { select: { email: true, name: true } } },
    });
    const project = await prisma.project.findUnique({
      where: { id: task.projectId },
      select: { name: true },
    });
    if (!assignee || !project) return;

    await notifier.taskAssigned({
      email: assignee.user.email,
      assigneeName: assignee.user.name,
      assignerName: getAuth(req).user.name,
      taskTitle: task.title,
      projectName: project.name,
      organizationId: membership.organizationId,
      projectId: task.projectId,
    });
  }

  router.get("/projects/:projectId/tasks", async (req, res) => {
    res.json({ tasks: await tasks.list(getMembership(req), req.params.projectId) });
  });

  router.post("/projects/:projectId/tasks", async (req, res) => {
    const membership = authorize(req, "tasks:create");
    const input = parse(createTaskSchema, req.body);
    const task = await tasks.create(membership, req.params.projectId, input);
    await audit.recordFromRequest(req, {
      action: "task.created",
      targetType: "task",
      targetId: task.id,
      metadata: { title: task.title, projectId: task.projectId },
    });
    await notifyAssignee(req, task);
    res.status(201).json({ task });
  });

  router.patch("/projects/:projectId/tasks/:taskId", async (req, res) => {
    const membership = authorize(req, "tasks:update");
    const input = parse(updateTaskSchema, req.body);
    const { projectId, taskId } = req.params;
    const { task, previousAssigneeId } = await tasks.update(membership, projectId, taskId, input);
    await audit.recordFromRequest(req, {
      action: "task.updated",
      targetType: "task",
      targetId: task.id,
      metadata: { title: task.title, projectId, changes: Object.keys(input) },
    });
    if (task.assignee && task.assignee.membershipId !== previousAssigneeId) {
      await notifyAssignee(req, task);
    }
    res.json({ task });
  });

  router.delete("/projects/:projectId/tasks/:taskId", async (req, res) => {
    const membership = authorize(req, "tasks:delete");
    const { projectId, taskId } = req.params;
    const { title } = await tasks.remove(membership, projectId, taskId);
    await audit.recordFromRequest(req, {
      action: "task.deleted",
      targetType: "task",
      targetId: taskId,
      metadata: { title, projectId },
    });
    res.status(204).end();
  });

  return router;
}

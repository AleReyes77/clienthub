import type { createTaskSchema, TaskDto, updateTaskSchema } from "@clienthub/shared";
import type { z } from "zod";
import { fromDateOnly, toDateOnly } from "../../lib/dates.js";
import { badRequest, notFound } from "../../lib/errors.js";
import type { Prisma, PrismaClient } from "../../lib/prisma.js";
import { createProjectsService, type MembershipContext } from "../projects/projects.service.js";

const taskSelect = {
  id: true,
  projectId: true,
  title: true,
  description: true,
  status: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: { id: true, user: { select: { name: true } } } },
} as const satisfies Prisma.TaskSelect;

type TaskRow = Prisma.TaskGetPayload<{ select: typeof taskSelect }>;

function toTaskDto(task: TaskRow): TaskDto {
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    description: task.description,
    status: task.status,
    assignee: task.assignee
      ? { membershipId: task.assignee.id, name: task.assignee.user.name }
      : null,
    dueDate: task.dueDate ? toDateOnly(task.dueDate) : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function createTasksService(prisma: PrismaClient) {
  const projects = createProjectsService(prisma);

  /** Tasks can only be assigned to team members of the same organization (not clients). */
  async function assertAssignable(organizationId: string, membershipId: string) {
    const member = await prisma.membership.findFirst({
      where: { id: membershipId, organizationId, role: { not: "CLIENT" } },
      select: { id: true },
    });
    if (!member) {
      throw badRequest("INVALID_ASSIGNEE", "Tasks can only be assigned to team members");
    }
  }

  async function findTask(membership: MembershipContext, projectId: string, taskId: string) {
    await projects.findVisible(membership, projectId);
    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    });
    if (!task) throw notFound("Task");
    return task;
  }

  return {
    async list(membership: MembershipContext, projectId: string): Promise<TaskDto[]> {
      await projects.findVisible(membership, projectId);
      const tasks = await prisma.task.findMany({
        where: { projectId },
        select: taskSelect,
        orderBy: [
          { status: "asc" },
          { dueDate: { sort: "asc", nulls: "last" } },
          { createdAt: "asc" },
        ],
      });
      return tasks.map(toTaskDto);
    },

    async create(
      membership: MembershipContext,
      projectId: string,
      input: z.output<typeof createTaskSchema>,
    ): Promise<TaskDto> {
      await projects.findVisible(membership, projectId);
      if (input.assigneeMembershipId) {
        await assertAssignable(membership.organizationId, input.assigneeMembershipId);
      }
      const task = await prisma.task.create({
        data: {
          projectId,
          title: input.title,
          description: input.description ?? null,
          assigneeMembershipId: input.assigneeMembershipId ?? null,
          dueDate: input.dueDate ? fromDateOnly(input.dueDate) : null,
        },
        select: taskSelect,
      });
      return toTaskDto(task);
    },

    async update(
      membership: MembershipContext,
      projectId: string,
      taskId: string,
      input: z.output<typeof updateTaskSchema>,
    ): Promise<TaskDto> {
      await findTask(membership, projectId, taskId);
      if (input.assigneeMembershipId) {
        await assertAssignable(membership.organizationId, input.assigneeMembershipId);
      }
      const task = await prisma.task.update({
        where: { id: taskId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description || null } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.assigneeMembershipId !== undefined
            ? { assigneeMembershipId: input.assigneeMembershipId }
            : {}),
          ...(input.dueDate !== undefined
            ? { dueDate: input.dueDate ? fromDateOnly(input.dueDate) : null }
            : {}),
        },
        select: taskSelect,
      });
      return toTaskDto(task);
    },

    async remove(membership: MembershipContext, projectId: string, taskId: string) {
      await findTask(membership, projectId, taskId);
      await prisma.task.delete({ where: { id: taskId } });
    },
  };
}

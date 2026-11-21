import {
  type CreateProjectInput,
  can,
  type ProjectDto,
  type Role,
  TASK_STATUSES,
  type TaskStatus,
  type UpdateProjectInput,
} from "@clienthub/shared";
import { badRequest, notFound } from "../../lib/errors.js";
import type { Prisma, PrismaClient } from "../../lib/prisma.js";

export interface MembershipContext {
  id: string;
  organizationId: string;
  role: Role;
}

const projectSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  client: { select: { id: true, user: { select: { name: true } } } },
} as const satisfies Prisma.ProjectSelect;

type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof projectSelect }>;

function emptyCounts(): Record<TaskStatus, number> {
  return Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
}

function toProjectDto(project: ProjectRow, counts = emptyCounts()): ProjectDto {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    client: project.client
      ? { membershipId: project.client.id, name: project.client.user.name }
      : null,
    taskCounts: counts,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/**
 * Which projects a member may see. This filter is the main defense against IDOR:
 * every project query goes through it, so changing an ID in the URL never exposes
 * a project from another organization or another client.
 */
export function visibleProjectsWhere(membership: MembershipContext): Prisma.ProjectWhereInput {
  return {
    organizationId: membership.organizationId,
    ...(can(membership.role, "projects:readAll") ? {} : { clientMembershipId: membership.id }),
  };
}

export function createProjectsService(prisma: PrismaClient) {
  async function countTasks(projectIds: string[]) {
    const groups = await prisma.task.groupBy({
      by: ["projectId", "status"],
      where: { projectId: { in: projectIds } },
      _count: { _all: true },
    });
    const counts = new Map<string, Record<TaskStatus, number>>();
    for (const group of groups) {
      const projectCounts = counts.get(group.projectId) ?? emptyCounts();
      projectCounts[group.status] = group._count._all;
      counts.set(group.projectId, projectCounts);
    }
    return counts;
  }

  /** The client of a project must be a CLIENT member of the same organization. */
  async function assertClientMember(organizationId: string, clientMembershipId: string) {
    const client = await prisma.membership.findFirst({
      where: { id: clientMembershipId, organizationId, role: "CLIENT" },
      select: { id: true },
    });
    if (!client) throw badRequest("INVALID_CLIENT", "The selected client is not a client member");
  }

  async function findVisible(membership: MembershipContext, projectId: string) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, ...visibleProjectsWhere(membership) },
      select: projectSelect,
    });
    if (!project) throw notFound("Project");
    return project;
  }

  async function get(membership: MembershipContext, projectId: string): Promise<ProjectDto> {
    const project = await findVisible(membership, projectId);
    const counts = await countTasks([project.id]);
    return toProjectDto(project, counts.get(project.id));
  }

  return {
    findVisible,
    get,

    async list(membership: MembershipContext): Promise<ProjectDto[]> {
      const projects = await prisma.project.findMany({
        where: visibleProjectsWhere(membership),
        select: projectSelect,
        orderBy: { updatedAt: "desc" },
      });
      const counts = await countTasks(projects.map((p) => p.id));
      return projects.map((p) => toProjectDto(p, counts.get(p.id)));
    },

    async create(membership: MembershipContext, input: CreateProjectInput): Promise<ProjectDto> {
      if (input.clientMembershipId) {
        await assertClientMember(membership.organizationId, input.clientMembershipId);
      }
      const project = await prisma.project.create({
        data: {
          organizationId: membership.organizationId,
          name: input.name,
          description: input.description ?? null,
          clientMembershipId: input.clientMembershipId ?? null,
        },
        select: projectSelect,
      });
      return toProjectDto(project);
    },

    async update(
      membership: MembershipContext,
      projectId: string,
      input: UpdateProjectInput,
    ): Promise<ProjectDto> {
      await findVisible(membership, projectId);
      if (input.clientMembershipId) {
        await assertClientMember(membership.organizationId, input.clientMembershipId);
      }
      await prisma.project.update({
        where: { id: projectId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description || null } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.clientMembershipId !== undefined
            ? { clientMembershipId: input.clientMembershipId }
            : {}),
        },
      });
      return get(membership, projectId);
    },

    async remove(membership: MembershipContext, projectId: string) {
      await findVisible(membership, projectId);
      await prisma.project.delete({ where: { id: projectId } });
    },
  };
}

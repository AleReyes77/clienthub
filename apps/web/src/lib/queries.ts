"use client";

import type {
  AuditLogPageDto,
  CurrentUserDto,
  InvitationDto,
  MemberDto,
  OrganizationDto,
  ProjectDto,
  ProjectFileDto,
  Role,
  TaskDto,
} from "@clienthub/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ApiError, api } from "./api";

/** Query keys in one place so mutations can invalidate the right data. */
export const keys = {
  me: ["me"] as const,
  orgs: ["orgs"] as const,
  org: (orgId: string) => ["orgs", orgId] as const,
  projects: (orgId: string) => ["orgs", orgId, "projects"] as const,
  project: (orgId: string, projectId: string) => ["orgs", orgId, "projects", projectId] as const,
  tasks: (orgId: string, projectId: string) =>
    ["orgs", orgId, "projects", projectId, "tasks"] as const,
  members: (orgId: string) => ["orgs", orgId, "members"] as const,
  invitations: (orgId: string) => ["orgs", orgId, "invitations"] as const,
  files: (orgId: string, projectId: string) =>
    ["orgs", orgId, "projects", projectId, "files"] as const,
  auditLogs: (orgId: string) => ["orgs", orgId, "audit-logs"] as const,
};

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return (await api<{ user: CurrentUserDto }>("/auth/me")).user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

export function useOrganizations() {
  return useQuery({
    queryKey: keys.orgs,
    queryFn: async () => (await api<{ organizations: OrganizationDto[] }>("/orgs")).organizations,
  });
}

export function useOrganization(orgId: string) {
  return useQuery({
    queryKey: keys.org(orgId),
    queryFn: async () =>
      (await api<{ organization: OrganizationDto }>(`/orgs/${orgId}`)).organization,
  });
}

export function useProjects(orgId: string) {
  return useQuery({
    queryKey: keys.projects(orgId),
    queryFn: async () =>
      (await api<{ projects: ProjectDto[] }>(`/orgs/${orgId}/projects`)).projects,
  });
}

export function useProject(orgId: string, projectId: string) {
  return useQuery({
    queryKey: keys.project(orgId, projectId),
    queryFn: async () =>
      (await api<{ project: ProjectDto }>(`/orgs/${orgId}/projects/${projectId}`)).project,
  });
}

export function useTasks(orgId: string, projectId: string) {
  return useQuery({
    queryKey: keys.tasks(orgId, projectId),
    queryFn: async () =>
      (await api<{ tasks: TaskDto[] }>(`/orgs/${orgId}/projects/${projectId}/tasks`)).tasks,
  });
}

export function useMembers(orgId: string, enabled = true) {
  return useQuery({
    queryKey: keys.members(orgId),
    queryFn: async () => (await api<{ members: MemberDto[] }>(`/orgs/${orgId}/members`)).members,
    enabled,
  });
}

export function useInvitations(orgId: string, enabled = true) {
  return useQuery({
    queryKey: keys.invitations(orgId),
    queryFn: async () =>
      (await api<{ invitations: InvitationDto[] }>(`/orgs/${orgId}/invitations`)).invitations,
    enabled,
  });
}

export function membersWithRole(members: MemberDto[] | undefined, roles: Role[]) {
  return (members ?? []).filter((m) => roles.includes(m.role));
}

export function useFiles(orgId: string, projectId: string) {
  return useQuery({
    queryKey: keys.files(orgId, projectId),
    queryFn: async () =>
      (await api<{ files: ProjectFileDto[] }>(`/orgs/${orgId}/projects/${projectId}/files`)).files,
  });
}

export function useAuditLogs(orgId: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.auditLogs(orgId),
    queryFn: ({ pageParam }) =>
      api<AuditLogPageDto>(
        `/orgs/${orgId}/audit-logs${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
  });
}

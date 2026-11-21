import type { InvitableRole, Role } from "./roles";
import type { ProjectStatus, TaskStatus } from "./schemas";

/** Response shapes returned by the API (dates are ISO strings). */

export interface UserDto {
  id: string;
  name: string;
  email: string;
}

/** The logged-in user, as returned by /auth/me, /auth/login and /auth/register. */
export interface CurrentUserDto extends UserDto {
  emailVerified: boolean;
}

export interface OrganizationDto {
  id: string;
  name: string;
  /** Role of the current user in this organization. */
  role: Role;
  membershipId: string;
  createdAt: string;
}

export interface MemberDto {
  membershipId: string;
  role: Role;
  user: UserDto;
  joinedAt: string;
}

export interface InvitationDto {
  id: string;
  email: string;
  role: InvitableRole;
  expiresAt: string;
  createdAt: string;
}

export interface CreatedInvitationDto extends InvitationDto {
  /** Returned only once, when the invitation is created. */
  token: string;
}

export interface MemberSummaryDto {
  membershipId: string;
  name: string;
}

export interface ProjectDto {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  client: MemberSummaryDto | null;
  taskCounts: Record<TaskStatus, number>;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDto {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignee: MemberSummaryDto | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFileDto {
  id: string;
  name: string;
  contentType: string;
  size: number;
  uploadedBy: MemberSummaryDto | null;
  createdAt: string;
}

export interface AuditLogDto {
  id: string;
  /** For example "project.created" or "member.role_changed". */
  action: string;
  actor: { id: string; name: string } | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogPageDto {
  entries: AuditLogDto[];
  /** Pass as `?cursor=` to get the next page; null when there are no more entries. */
  nextCursor: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
  };
}

import type { InvitableRole, Role } from "./roles";
import type { ProjectStatus, TaskStatus } from "./schemas";

/** Response shapes returned by the API (dates are ISO strings). */

export interface UserDto {
  id: string;
  name: string;
  email: string;
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

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
  };
}

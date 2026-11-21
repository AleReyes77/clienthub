import type { ProjectStatus, Role, TaskStatus } from "@clienthub/shared";

export const roleLabels: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  CLIENT: "Client",
};

export const projectStatusLabels: Record<ProjectStatus, string> = {
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

export function formatDate(value: string): string {
  // Date-only values ("2026-12-01") are shown in UTC so they never shift a day.
  const date = value.length === 10 ? new Date(`${value}T00:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: value.length === 10 ? "UTC" : undefined,
  }).format(date);
}

export function isOverdue(dueDate: string | null, status: TaskStatus): boolean {
  if (!dueDate || status === "DONE") return false;
  return dueDate < new Date().toISOString().slice(0, 10);
}

/** Only allow relative redirects after login (prevents open redirects like ?next=//evil.com). */
export function safeRedirect(next: string | null, fallback = "/dashboard"): string {
  const isRelativePath = next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\");
  return isRelativePath && next ? next : fallback;
}

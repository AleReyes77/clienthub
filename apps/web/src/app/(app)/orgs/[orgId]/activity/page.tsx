"use client";

import { type AuditLogDto, can } from "@clienthub/shared";
import { useParams } from "next/navigation";
import { Button, Card, EmptyState, ErrorMessage, PageLoader } from "@/components/ui";
import { formatDateTime, roleLabels } from "@/lib/format";
import { useAuditLogs, useOrganization } from "@/lib/queries";

/** Turns an audit entry into a short sentence. Unknown actions fall back to the raw name. */
function describe(entry: AuditLogDto): string {
  const m = (entry.metadata ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof m[key] === "string" ? (m[key] as string) : "");
  const role = (key: string) =>
    roleLabels[text(key) as keyof typeof roleLabels]?.toLowerCase() ?? text(key);

  switch (entry.action) {
    case "organization.created":
      return "created the workspace";
    case "invitation.created":
      return `invited ${text("email")} as ${role("role")}`;
    case "invitation.revoked":
      return `revoked the invitation for ${text("email")}`;
    case "member.joined":
      return `joined as ${role("role")}`;
    case "member.role_changed":
      return `changed ${text("email")} from ${role("from")} to ${role("to")}`;
    case "member.removed":
      return `removed ${text("email")}`;
    case "project.created":
      return `created the project "${text("name")}"`;
    case "project.updated":
      return `updated the project "${text("name")}"`;
    case "project.deleted":
      return `deleted the project "${text("name")}"`;
    case "task.created":
      return `created the task "${text("title")}"`;
    case "task.updated":
      return `updated the task "${text("title")}"`;
    case "task.deleted":
      return `deleted the task "${text("title")}"`;
    case "file.uploaded":
      return `uploaded "${text("name")}"`;
    case "file.deleted":
      return `deleted the file "${text("name")}"`;
    default:
      return entry.action;
  }
}

export default function ActivityPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data: org } = useOrganization(orgId);
  const allowed = org ? can(org.role, "audit:read") : false;
  const logs = useAuditLogs(orgId, allowed);

  if (!org) return <PageLoader />;
  if (!allowed) return <ErrorMessage error={new Error("You do not have access to this page.")} />;
  if (logs.isPending) return <PageLoader />;
  if (logs.error) return <ErrorMessage error={logs.error} />;

  const entries = logs.data.pages.flatMap((page) => page.entries);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Activity</h2>
        <p className="text-sm text-slate-500">
          A permanent record of important changes in this workspace. Only owners and admins can see
          it.
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState title="No activity yet" />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3"
              >
                <p className="text-sm">
                  <span className="font-medium">{entry.actor?.name ?? "Deleted user"}</span>{" "}
                  <span className="text-slate-600">{describe(entry)}</span>
                </p>
                <time dateTime={entry.createdAt} className="text-xs text-slate-400">
                  {formatDateTime(entry.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {logs.hasNextPage && (
        <Button
          variant="secondary"
          loading={logs.isFetchingNextPage}
          onClick={() => logs.fetchNextPage()}
        >
          Load older activity
        </Button>
      )}
    </div>
  );
}

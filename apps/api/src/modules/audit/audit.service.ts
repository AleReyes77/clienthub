import type { AuditLogDto, AuditLogPageDto } from "@clienthub/shared";
import type { Request } from "express";
import { badRequest } from "../../lib/errors.js";
import type { Prisma, PrismaClient } from "../../lib/prisma.js";

/** Actions recorded in the audit log. Keeping them in one list makes them easy to review. */
export type AuditAction =
  | "organization.created"
  | "invitation.created"
  | "invitation.revoked"
  | "member.joined"
  | "member.role_changed"
  | "member.removed"
  | "project.created"
  | "project.updated"
  | "project.deleted"
  | "task.created"
  | "task.updated"
  | "task.deleted"
  | "file.uploaded"
  | "file.deleted";

export interface AuditEvent {
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonObject;
}

const PAGE_SIZE = 50;

/** Cursor = "<ISO date>_<id>", so pages stay stable while new entries are added. */
function encodeCursor(entry: { createdAt: Date; id: string }) {
  return Buffer.from(`${entry.createdAt.toISOString()}_${entry.id}`).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const [date, id] = Buffer.from(cursor, "base64url").toString().split("_");
  const createdAt = new Date(date ?? "");
  if (!id || Number.isNaN(createdAt.getTime()))
    throw badRequest("INVALID_CURSOR", "Invalid cursor");
  return { createdAt, id };
}

export function createAuditService(prisma: PrismaClient) {
  async function record(
    context: { organizationId: string; actorUserId: string | null; ip: string | null },
    event: AuditEvent,
  ) {
    await prisma.auditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.actorUserId,
        action: event.action,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        ...(event.metadata ? { metadata: event.metadata } : {}),
        ip: context.ip,
      },
    });
  }

  return {
    record,

    /** Records an event for the organization of the current request. */
    async recordFromRequest(req: Request, event: AuditEvent, organizationId?: string) {
      const orgId = organizationId ?? req.membership?.organizationId;
      if (!orgId) throw new Error("recordFromRequest needs an organization");
      await record(
        { organizationId: orgId, actorUserId: req.auth?.user.id ?? null, ip: req.ip ?? null },
        event,
      );
    },

    async list(organizationId: string, cursor?: string): Promise<AuditLogPageDto> {
      const after = cursor ? decodeCursor(cursor) : undefined;
      const rows = await prisma.auditLog.findMany({
        where: {
          organizationId,
          ...(after
            ? {
                OR: [
                  { createdAt: { lt: after.createdAt } },
                  { createdAt: after.createdAt, id: { lt: after.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: PAGE_SIZE + 1,
        // The IP address is kept for investigations but not shown in the UI.
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          metadata: true,
          createdAt: true,
          actor: { select: { id: true, name: true } },
        },
      });

      const page = rows.slice(0, PAGE_SIZE);
      const last = page.at(-1);
      const entries: AuditLogDto[] = page.map((row) => ({
        id: row.id,
        action: row.action,
        actor: row.actor,
        targetType: row.targetType,
        targetId: row.targetId,
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
        createdAt: row.createdAt.toISOString(),
      }));

      return {
        entries,
        nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor(last) : null,
      };
    },
  };
}

export type AuditService = ReturnType<typeof createAuditService>;

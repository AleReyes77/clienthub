import { can, type Permission } from "@clienthub/shared";
import type { Request, RequestHandler } from "express";
import { forbidden, notFound } from "../lib/errors.js";
import type { PrismaClient } from "../lib/prisma.js";

/**
 * Loads the current user's membership in `:orgId`.
 * Non-members get a 404 (not a 403) so organization IDs cannot be probed.
 */
export function requireMembership(prisma: PrismaClient): RequestHandler<{ orgId: string }> {
  return async (req, _res, next) => {
    const userId = req.auth?.user.id;
    if (!userId) return next(notFound("Organization"));

    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId: req.params.orgId } },
      select: { id: true, organizationId: true, role: true },
    });
    if (!membership) return next(notFound("Organization"));

    req.membership = membership;
    next();
  };
}

/** Use after `requireMembership`; narrows the type for route handlers. */
export function getMembership(req: Request): NonNullable<Request["membership"]> {
  if (!req.membership) throw notFound("Organization");
  return req.membership;
}

/**
 * Checks a permission for the current member and returns the membership.
 * Called at the top of each handler (instead of as middleware) so Express keeps
 * the typed route params, and the required permission is visible next to the logic.
 */
export function authorize(
  req: Request,
  permission: Permission,
): NonNullable<Request["membership"]> {
  const membership = getMembership(req);
  if (!can(membership.role, permission)) throw forbidden();
  return membership;
}

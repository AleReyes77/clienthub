import type { Request, RequestHandler } from "express";
import type { Config } from "../config.js";
import { unauthorized } from "../lib/errors.js";
import type { PrismaClient } from "../lib/prisma.js";
import { hashToken } from "../lib/tokens.js";

/** Attaches `req.auth` when the request has a valid, unexpired session cookie. */
export function loadSession(prisma: PrismaClient, config: Config): RequestHandler {
  return async (req, _res, next) => {
    const token: unknown = req.cookies?.[config.sessionCookieName];
    if (typeof token !== "string" || token.length === 0) return next();

    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        expiresAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (session && session.expiresAt > new Date()) {
      req.auth = { sessionId: session.id, user: session.user };
    }
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  next();
};

/** Use after `requireAuth`; narrows the type for route handlers. */
export function getAuth(req: Request): NonNullable<Request["auth"]> {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

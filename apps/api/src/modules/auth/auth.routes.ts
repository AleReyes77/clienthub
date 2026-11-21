import { loginSchema, registerSchema } from "@clienthub/shared";
import { type CookieOptions, type Request, Router } from "express";
import type { Config } from "../../config.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { parse } from "../../lib/validate.js";
import { getAuth, requireAuth } from "../../middleware/auth.js";
import { createAuthRateLimiter } from "../../middleware/rate-limit.js";
import { createAuthService, type SessionMeta } from "./auth.service.js";

function sessionMeta(req: Request): SessionMeta {
  return { userAgent: req.get("user-agent"), ip: req.ip };
}

export function authRouter(prisma: PrismaClient, config: Config) {
  const router = Router();
  const auth = createAuthService(prisma, config);
  const authLimiter = createAuthRateLimiter(config.RATE_LIMIT_AUTH_MAX);

  const cookieOptions: CookieOptions = {
    httpOnly: true, // not readable from JavaScript (limits the impact of XSS)
    secure: config.isProduction, // HTTPS only in production
    sameSite: "lax", // not sent on cross-site POST requests (CSRF defense in depth)
    path: "/",
  };

  router.post("/register", authLimiter, async (req, res) => {
    const input = parse(registerSchema, req.body);
    const { user, sessionToken } = await auth.register(input, sessionMeta(req));
    res.cookie(config.sessionCookieName, sessionToken, {
      ...cookieOptions,
      maxAge: config.sessionTtlMs,
    });
    res.status(201).json({ user });
  });

  router.post("/login", authLimiter, async (req, res) => {
    const input = parse(loginSchema, req.body);
    const { user, sessionToken } = await auth.login(input, sessionMeta(req));
    res.cookie(config.sessionCookieName, sessionToken, {
      ...cookieOptions,
      maxAge: config.sessionTtlMs,
    });
    res.json({ user });
  });

  router.post("/logout", async (req, res) => {
    if (req.auth) await auth.logout(req.auth.sessionId);
    res.clearCookie(config.sessionCookieName, cookieOptions);
    res.status(204).end();
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({ user: getAuth(req).user });
  });

  return router;
}

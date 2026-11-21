import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "@clienthub/shared";
import { type CookieOptions, type Request, Router } from "express";
import type { Config } from "../../config.js";
import type { Logger } from "../../lib/logger.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { parse } from "../../lib/validate.js";
import { getAuth, requireAuth } from "../../middleware/auth.js";
import { createAuthRateLimiter, type RateLimitStoreFactory } from "../../middleware/rate-limit.js";
import type { Notifier } from "../notifications/notifier.js";
import { createAuthService, type SessionMeta } from "./auth.service.js";

function sessionMeta(req: Request): SessionMeta {
  return { userAgent: req.get("user-agent"), ip: req.ip };
}

export function authRouter(deps: {
  prisma: PrismaClient;
  config: Config;
  logger: Logger;
  notifier: Notifier;
  rateLimitStore?: RateLimitStoreFactory | undefined;
}) {
  const { prisma, config, logger, notifier } = deps;
  const router = Router();
  const auth = createAuthService(prisma, config, notifier);
  const limiter = (name: string) =>
    createAuthRateLimiter(config.RATE_LIMIT_AUTH_MAX, deps.rateLimitStore?.(`auth-${name}`));

  const cookieOptions: CookieOptions = {
    httpOnly: true, // not readable from JavaScript (limits the impact of XSS)
    secure: config.isProduction, // HTTPS only in production
    sameSite: "lax", // not sent on cross-site POST requests (CSRF defense in depth)
    path: "/",
  };

  router.post("/register", limiter("register"), async (req, res) => {
    const input = parse(registerSchema, req.body);
    const { user, sessionToken } = await auth.register(input, sessionMeta(req));
    res.cookie(config.sessionCookieName, sessionToken, {
      ...cookieOptions,
      maxAge: config.sessionTtlMs,
    });
    res.status(201).json({ user });
  });

  router.post("/login", limiter("login"), async (req, res) => {
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

  router.get("/me", requireAuth, async (req, res) => {
    res.json({ user: await auth.me(getAuth(req).user.id) });
  });

  router.post("/verify-email", limiter("verify"), async (req, res) => {
    const { token } = parse(verifyEmailSchema, req.body);
    await auth.verifyEmail(token);
    res.status(204).end();
  });

  router.post("/resend-verification", limiter("resend"), async (req, res) => {
    await auth.resendVerification(getAuth(req).user.id);
    res.status(204).end();
  });

  router.post("/forgot-password", limiter("forgot"), async (req, res) => {
    const { email } = parse(forgotPasswordSchema, req.body);
    // Answer first, then do the work: the response is identical and takes the same
    // time whether or not the account exists (no account enumeration).
    res.status(202).end();
    try {
      await auth.requestPasswordReset(email);
    } catch (err) {
      logger.error({ err }, "Password reset request failed");
    }
  });

  router.post("/reset-password", limiter("reset"), async (req, res) => {
    const input = parse(resetPasswordSchema, req.body);
    await auth.resetPassword(input);
    res.clearCookie(config.sessionCookieName, cookieOptions);
    res.status(204).end();
  });

  return router;
}

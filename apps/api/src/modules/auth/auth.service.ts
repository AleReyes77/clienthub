import type { loginSchema, registerSchema, UserDto } from "@clienthub/shared";
import type { z } from "zod";
import type { Config } from "../../config.js";
import { AppError, conflict } from "../../lib/errors.js";
import { hashPassword, verifyAgainstDummyHash, verifyPassword } from "../../lib/password.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { generateToken, hashToken } from "../../lib/tokens.js";

export interface SessionMeta {
  userAgent: string | undefined;
  ip: string | undefined;
}

export interface AuthResult {
  user: UserDto;
  /** Raw session token for the cookie. Only its hash is stored. */
  sessionToken: string;
}

const invalidCredentials = () =>
  new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");

export function createAuthService(prisma: PrismaClient, config: Config) {
  async function createSession(userId: string, meta: SessionMeta): Promise<string> {
    const token = generateToken();
    await prisma.session.create({
      data: {
        tokenHash: hashToken(token),
        userId,
        userAgent: meta.userAgent?.slice(0, 255),
        ip: meta.ip,
        expiresAt: new Date(Date.now() + config.sessionTtlMs),
      },
    });
    return token;
  }

  return {
    async register(input: z.output<typeof registerSchema>, meta: SessionMeta) {
      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      if (existing) throw conflict("EMAIL_TAKEN", "An account with this email already exists");

      const user = await prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash: await hashPassword(input.password),
        },
        select: { id: true, name: true, email: true },
      });

      return { user, sessionToken: await createSession(user.id, meta) } satisfies AuthResult;
    },

    async login(input: z.output<typeof loginSchema>, meta: SessionMeta): Promise<AuthResult> {
      const user = await prisma.user.findUnique({ where: { email: input.email } });
      const valid = user
        ? await verifyPassword(user.passwordHash, input.password)
        : await verifyAgainstDummyHash(input.password);
      if (!user || !valid) throw invalidCredentials();

      // Housekeeping: drop this user's expired sessions.
      await prisma.session.deleteMany({
        where: { userId: user.id, expiresAt: { lt: new Date() } },
      });

      return {
        user: { id: user.id, name: user.name, email: user.email },
        sessionToken: await createSession(user.id, meta),
      };
    },

    async logout(sessionId: string) {
      await prisma.session.deleteMany({ where: { id: sessionId } });
    },
  };
}

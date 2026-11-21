import type {
  CurrentUserDto,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@clienthub/shared";
import type { z } from "zod";
import type { Config } from "../../config.js";
import { AppError, conflict } from "../../lib/errors.js";
import { hashPassword, verifyAgainstDummyHash, verifyPassword } from "../../lib/password.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { generateToken, hashToken } from "../../lib/tokens.js";
import type { Notifier } from "../notifications/notifier.js";
import { createEmailTokensService } from "./email-tokens.service.js";

export interface SessionMeta {
  userAgent: string | undefined;
  ip: string | undefined;
}

export interface AuthResult {
  user: CurrentUserDto;
  /** Raw session token for the cookie. Only its hash is stored. */
  sessionToken: string;
}

const invalidCredentials = () =>
  new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");

function toCurrentUser(user: {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt: Date | null;
}): CurrentUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

export function createAuthService(prisma: PrismaClient, config: Config, notifier: Notifier) {
  const emailTokens = createEmailTokensService(prisma);

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
    async register(input: z.output<typeof registerSchema>, meta: SessionMeta): Promise<AuthResult> {
      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      if (existing) throw conflict("EMAIL_TAKEN", "An account with this email already exists");

      const user = await prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash: await hashPassword(input.password),
        },
      });

      await notifier.verifyEmail(user, await emailTokens.issue(user.id, "VERIFY_EMAIL"));

      return { user: toCurrentUser(user), sessionToken: await createSession(user.id, meta) };
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

      return { user: toCurrentUser(user), sessionToken: await createSession(user.id, meta) };
    },

    async logout(sessionId: string) {
      await prisma.session.deleteMany({ where: { id: sessionId } });
    },

    async me(userId: string): Promise<CurrentUserDto> {
      return toCurrentUser(await prisma.user.findUniqueOrThrow({ where: { id: userId } }));
    },

    async verifyEmail(token: string) {
      const userId = await emailTokens.consume(token, "VERIFY_EMAIL");
      await prisma.user.updateMany({
        where: { id: userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: new Date() },
      });
    },

    async resendVerification(userId: string) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.emailVerifiedAt) return;
      await notifier.verifyEmail(user, await emailTokens.issue(user.id, "VERIFY_EMAIL"));
    },

    /** Never reveals whether the email has an account. */
    async requestPasswordReset(email: string) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return;
      await notifier.passwordReset(user, await emailTokens.issue(user.id, "PASSWORD_RESET"));
    },

    async resetPassword(input: z.output<typeof resetPasswordSchema>) {
      const userId = await emailTokens.consume(input.token, "PASSWORD_RESET");
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: {
            passwordHash: await hashPassword(input.password),
            // Following the link proves the user controls the inbox.
            emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
          },
        }),
        // Log out every device: whoever knew the old password loses access.
        prisma.session.deleteMany({ where: { userId } }),
      ]);

      await notifier.passwordChanged(user);
    },
  };
}

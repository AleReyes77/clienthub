import { badRequest } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { generateToken, hashToken } from "../../lib/tokens.js";

export type EmailTokenType = "VERIFY_EMAIL" | "PASSWORD_RESET";

export const EMAIL_TOKEN_TTL_MS: Record<EmailTokenType, number> = {
  VERIFY_EMAIL: 24 * 60 * 60 * 1000,
  // Short-lived: a reset link gives full control of the account.
  PASSWORD_RESET: 60 * 60 * 1000,
};

/** Same error for unknown, used and expired tokens, so they cannot be told apart. */
const invalidToken = () =>
  badRequest("INVALID_TOKEN", "This link is invalid or has expired. Request a new one.");

export function createEmailTokensService(prisma: PrismaClient) {
  return {
    /** Creates a new single-use token and invalidates older unused ones of the same type. */
    async issue(userId: string, type: EmailTokenType): Promise<string> {
      const token = generateToken();
      await prisma.$transaction([
        prisma.emailToken.deleteMany({ where: { userId, type, usedAt: null } }),
        prisma.emailToken.create({
          data: {
            userId,
            type,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS[type]),
          },
        }),
      ]);
      return token;
    },

    /**
     * Marks the token as used and returns its user. The `updateMany` with `usedAt: null`
     * makes this atomic: two concurrent requests cannot both use the same token.
     */
    async consume(token: string, type: EmailTokenType): Promise<string> {
      const tokenHash = hashToken(token);
      const record = await prisma.emailToken.findUnique({ where: { tokenHash } });
      if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) {
        throw invalidToken();
      }

      const { count } = await prisma.emailToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count === 0) throw invalidToken();
      return record.userId;
    },
  };
}

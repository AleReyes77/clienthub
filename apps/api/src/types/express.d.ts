import type { Role } from "@clienthub/shared";

declare global {
  namespace Express {
    interface Request {
      /** Set by `loadSession` when the request carries a valid session cookie. */
      auth?: {
        sessionId: string;
        user: { id: string; name: string; email: string; emailVerified: boolean };
      };
      /** Set by `requireMembership` on organization-scoped routes. */
      membership?: {
        id: string;
        organizationId: string;
        role: Role;
      };
    }
  }
}

import { createHash, randomBytes } from "node:crypto";

/** 256-bit random token, URL-safe. Used for session cookies and invitation links. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Tokens are stored hashed, so a database leak does not expose usable sessions or invitations.
 * A fast hash is fine here because the tokens are long and random (no brute force possible).
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

import type { RequestHandler } from "express";
import { forbidden } from "../lib/errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originFromReferer(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/**
 * CSRF protection for cookie-based sessions (OWASP: "Verifying origin with standard headers").
 *
 * Every state-changing request must come from an allowed origin. Browsers always send
 * `Origin` on cross-site POST/PATCH/DELETE requests and scripts cannot forge it.
 * This works together with `SameSite=Lax` cookies as defense in depth.
 */
export function originCheck(allowedOrigins: readonly string[]): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.get("origin") ?? originFromReferer(req.get("referer"));
    if (!origin || !allowedOrigins.includes(origin)) {
      return next(forbidden("Request origin is not allowed", "CSRF_ORIGIN_MISMATCH"));
    }
    next();
  };
}

import { rateLimit } from "express-rate-limit";
import { AppError } from "../lib/errors.js";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const tooManyRequests = () =>
  new AppError(429, "RATE_LIMITED", "Too many requests. Please try again later.");

/**
 * In-memory stores work for a single API instance. When the API is scaled
 * horizontally, switch to a shared Redis store (planned for v2).
 */
export function createApiRateLimiter() {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 600,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(tooManyRequests()),
  });
}

/** Strict limit for login/registration to slow down brute force and credential stuffing. */
export function createAuthRateLimiter(limit: number) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(tooManyRequests()),
  });
}

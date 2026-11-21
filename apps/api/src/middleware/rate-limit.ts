import { rateLimit, type Store } from "express-rate-limit";
import type { Redis } from "ioredis";
import { type RedisReply, RedisStore } from "rate-limit-redis";
import { AppError } from "../lib/errors.js";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const tooManyRequests = () =>
  new AppError(429, "RATE_LIMITED", "Too many requests. Please try again later.");

/** Creates one store per limiter (express-rate-limit does not allow sharing a store). */
export type RateLimitStoreFactory = (name: string) => Store;

/**
 * With Redis, counters are shared by every API instance and survive restarts.
 * Without it, each limiter keeps its counters in memory (fine for one instance).
 */
export function createRedisStoreFactory(redis: Redis, prefix = "rl:"): RateLimitStoreFactory {
  return (name) =>
    new RedisStore({
      prefix: `${prefix}${name}:`,
      sendCommand: (command: string, ...args: string[]) =>
        redis.call(command, ...args) as Promise<RedisReply>,
    });
}

export function createApiRateLimiter(store?: Store) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 600,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    ...(store ? { store } : {}),
    handler: (_req, _res, next) => next(tooManyRequests()),
  });
}

/** Strict limit for auth endpoints to slow down brute force and credential stuffing. */
export function createAuthRateLimiter(limit: number, store?: Store) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    ...(store ? { store } : {}),
    handler: (_req, _res, next) => next(tooManyRequests()),
  });
}

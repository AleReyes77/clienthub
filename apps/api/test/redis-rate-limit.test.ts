import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/lib/logger.js";
import { MemoryMailer } from "../src/lib/mailer.js";
import { createPrismaClient } from "../src/lib/prisma.js";
import { createInlineQueue } from "../src/lib/queue.js";
import { createLocalStorage } from "../src/lib/storage.js";
import { createJobHandlers } from "../src/services.js";
import { testDatabaseUrl, WEB_ORIGIN } from "./helpers.js";

const redisUrl = process.env.TEST_REDIS_URL;

/** With Redis, rate-limit counters are shared by every API instance. */
describe.skipIf(!redisUrl || !testDatabaseUrl)("rate limiting with Redis", () => {
  const redis = new Redis(redisUrl as string);
  const prisma = createPrismaClient(testDatabaseUrl as string);
  const logger = createLogger("silent");
  const prefix = `test-${randomUUID()}:`;

  function buildInstance() {
    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      WEB_ORIGIN,
      LOG_LEVEL: "silent",
      RATE_LIMIT_AUTH_MAX: "3",
    });
    const mailer = new MemoryMailer();
    const storage = createLocalStorage("uploads-test");
    const queue = createInlineQueue(createJobHandlers(mailer, storage), logger);
    return createApp({
      config,
      prisma,
      logger,
      services: { mailer, storage, queue, redis },
      rateLimitPrefix: prefix,
    });
  }

  afterAll(async () => {
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
    await prisma.$disconnect();
  });

  it("shares the login limit between two app instances", async () => {
    const [first, second] = [buildInstance(), buildInstance()];
    const attempt = (app: typeof first) =>
      request(app)
        .post("/api/v1/auth/login")
        .set("Origin", WEB_ORIGIN)
        .send({ email: "nobody@example.com", password: "wrong-password-123" });

    expect((await attempt(first)).status).toBe(401);
    expect((await attempt(second)).status).toBe(401);
    expect((await attempt(first)).status).toBe(401);
    // The fourth attempt is blocked even though it hits the other instance.
    expect((await attempt(second)).status).toBe(429);
  });
});

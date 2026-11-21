import request from "supertest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/lib/logger.js";
import { createPrismaClient } from "../src/lib/prisma.js";

try {
  process.loadEnvFile();
} catch {
  // CI provides TEST_DATABASE_URL directly.
}

/**
 * Integration tests need their own database because every test file wipes it.
 * They are skipped when TEST_DATABASE_URL is not set.
 */
export const testDatabaseUrl = process.env.TEST_DATABASE_URL;
export const WEB_ORIGIN = "http://localhost:3000";
export const PASSWORD = "correct-horse-battery-staple";

export function createTestContext(overrides: Record<string, string> = {}) {
  if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is not set");

  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: testDatabaseUrl,
    WEB_ORIGIN,
    LOG_LEVEL: "silent",
    RATE_LIMIT_AUTH_MAX: "1000",
    ...overrides,
  });
  const prisma = createPrismaClient(testDatabaseUrl);
  const app = createApp({ config, prisma, logger: createLogger("silent") });

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "tasks", "projects", "invitations", "memberships", "sessions", "organizations", "users" CASCADE',
    );
  }

  /** A supertest agent keeps cookies between requests, like a browser. */
  function agent() {
    const instance = request.agent(app);
    instance.set("Origin", WEB_ORIGIN);
    return instance;
  }

  async function registeredAgent(name: string, email: string) {
    const instance = agent();
    const res = await instance
      .post("/api/v1/auth/register")
      .send({ name, email, password: PASSWORD });
    if (res.status !== 201)
      throw new Error(`Register failed: ${res.status} ${JSON.stringify(res.body)}`);
    return instance;
  }

  return { app, prisma, config, resetDatabase, agent, registeredAgent };
}

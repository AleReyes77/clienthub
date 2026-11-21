import { mkdtempSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/lib/logger.js";
import { MemoryMailer } from "../src/lib/mailer.js";
import { createPrismaClient } from "../src/lib/prisma.js";
import { createInlineQueue } from "../src/lib/queue.js";
import { createLocalStorage } from "../src/lib/storage.js";
import { createJobHandlers } from "../src/services.js";

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

/** Extracts the token from a link like https://…/verify-email#token=abc */
export function tokenFromEmail(text: string | undefined): string {
  const match = text?.match(/(?:#token=|\/invite\/)([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error(`No token found in email:\n${text}`);
  return match[1];
}

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
  const logger = createLogger("silent");
  const prisma = createPrismaClient(testDatabaseUrl);

  // In-memory email, local temp storage and an inline queue: fast and fully observable.
  const uploadDir = mkdtempSync(path.join(tmpdir(), "clienthub-test-"));
  const mailer = new MemoryMailer();
  const storage = createLocalStorage(uploadDir);
  const queue = createInlineQueue(createJobHandlers(mailer, storage), logger);
  const app = createApp({ config, prisma, logger, services: { mailer, queue, storage } });

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "audit_logs", "project_files", "email_tokens", "tasks", "projects", "invitations", "memberships", "sessions", "organizations", "users" CASCADE',
    );
    mailer.clear();
    await rm(uploadDir, { recursive: true, force: true });
    await mkdir(uploadDir, { recursive: true });
  }

  async function close() {
    await queue.close();
    await prisma.$disconnect();
    await rm(uploadDir, { recursive: true, force: true });
  }

  /** A supertest agent keeps cookies between requests, like a browser. */
  function agent() {
    const instance = request.agent(app);
    instance.set("Origin", WEB_ORIGIN);
    return instance;
  }

  /** Registers a user. By default the email is marked as verified to keep tests short. */
  async function registeredAgent(name: string, email: string, options = { verified: true }) {
    const instance = agent();
    const res = await instance
      .post("/api/v1/auth/register")
      .send({ name, email, password: PASSWORD });
    if (res.status !== 201)
      throw new Error(`Register failed: ${res.status} ${JSON.stringify(res.body)}`);
    if (options.verified) {
      await prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
    }
    return instance;
  }

  return {
    app,
    prisma,
    config,
    mailer,
    queue,
    storage,
    uploadDir,
    resetDatabase,
    close,
    agent,
    registeredAgent,
  };
}

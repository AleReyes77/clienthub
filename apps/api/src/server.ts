import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./lib/logger.js";
import { createPrismaClient } from "./lib/prisma.js";

try {
  process.loadEnvFile();
} catch {
  // No .env file: use variables from the environment (CI, containers, production).
}

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const prisma = createPrismaClient(config.DATABASE_URL);
const app = createApp({ config, prisma, logger });

const server = app.listen(config.PORT, () => {
  logger.info(`ClientHub API listening on http://localhost:${config.PORT}`);
});

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Force exit if open connections do not close in time.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

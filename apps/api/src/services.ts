import { Redis } from "ioredis";
import type { Config } from "./config.js";
import type { Logger } from "./lib/logger.js";
import { createConsoleMailer, createSmtpMailer, type Mailer } from "./lib/mailer.js";
import {
  createBullMqQueue,
  createInlineQueue,
  type JobHandlers,
  type JobQueue,
} from "./lib/queue.js";
import { createLocalStorage, createS3Storage, type Storage } from "./lib/storage.js";

/** Infrastructure the app depends on. Tests pass in-memory versions. */
export interface Services {
  mailer: Mailer;
  queue: JobQueue;
  storage: Storage;
  /** Shared Redis client for rate limiting, when REDIS_URL is set. */
  redis?: Redis | undefined;
}

export function createJobHandlers(mailer: Mailer, storage: Storage): JobHandlers {
  return {
    "email.send": (message) => mailer.send(message),
    "storage.delete": async ({ keys }) => {
      await Promise.all(keys.map((key) => storage.delete(key)));
    },
  };
}

/** Picks each adapter from the configuration (see `.env.example`). */
export function createServices(config: Config, logger: Logger): Services {
  const mailer = config.SMTP_URL
    ? createSmtpMailer(config.SMTP_URL, config.MAIL_FROM)
    : createConsoleMailer(logger);

  const storage = config.S3_BUCKET
    ? createS3Storage({
        bucket: config.S3_BUCKET,
        region: config.S3_REGION,
        endpoint: config.S3_ENDPOINT,
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
        forcePathStyle: config.S3_FORCE_PATH_STYLE,
      })
    : createLocalStorage(config.UPLOAD_DIR);

  const handlers = createJobHandlers(mailer, storage);
  const queue = config.REDIS_URL
    ? createBullMqQueue(config.REDIS_URL, handlers, logger)
    : createInlineQueue(handlers, logger);

  const redis = config.REDIS_URL ? new Redis(config.REDIS_URL) : undefined;

  logger.info(
    {
      mailer: config.SMTP_URL ? "smtp" : "console",
      storage: config.S3_BUCKET ? "s3" : `local (${config.UPLOAD_DIR})`,
      queue: config.REDIS_URL ? "bullmq" : "inline",
    },
    "Services configured",
  );

  return { mailer, queue, storage, redis };
}

export async function closeServices(services: Services) {
  await services.queue.close();
  await services.redis?.quit();
}

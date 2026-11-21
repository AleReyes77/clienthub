import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import type { Logger } from "./logger.js";
import type { EmailMessage } from "./mailer.js";

/** Every background job and its payload. Adding a job here makes the compiler require a handler. */
export interface JobPayloads {
  "email.send": EmailMessage;
  "storage.delete": { keys: string[] };
}

export type JobName = keyof JobPayloads;

export type JobHandlers = {
  [K in JobName]: (data: JobPayloads[K]) => Promise<void>;
};

export interface JobQueue {
  enqueue<K extends JobName>(name: K, data: JobPayloads[K]): Promise<void>;
  close(): Promise<void>;
}

const QUEUE_NAME = "clienthub";

async function runHandler<K extends JobName>(
  handlers: JobHandlers,
  name: K,
  data: JobPayloads[K],
): Promise<void> {
  const handler = handlers[name] as (payload: JobPayloads[K]) => Promise<void>;
  await handler(data);
}

/**
 * Production queue backed by Redis (BullMQ). Jobs survive restarts and are retried
 * with exponential backoff. The worker runs in the API process; it can be moved to
 * its own process when the load requires it.
 */
export function createBullMqQueue(
  redisUrl: string,
  handlers: JobHandlers,
  logger: Logger,
): JobQueue {
  // BullMQ workers need `maxRetriesPerRequest: null` (blocking commands).
  const queueConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const workerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const queue = new Queue(QUEUE_NAME, {
    connection: queueConnection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 5_000 },
      // Email payloads can contain one-time links, so do not keep finished jobs around.
      removeOnComplete: true,
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  });

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => runHandler(handlers, job.name as JobName, job.data),
    { connection: workerConnection, concurrency: 5 },
  );
  worker.on("failed", (job, err) => {
    logger.error(
      { err, job: { id: job?.id, name: job?.name, attempts: job?.attemptsMade } },
      "Job failed",
    );
  });

  return {
    async enqueue(name, data) {
      await queue.add(name, data);
    },
    async close() {
      await worker.close();
      await queue.close();
      await Promise.all([queueConnection.quit(), workerConnection.quit()]);
    },
  };
}

export interface InlineQueue extends JobQueue {
  /** Resolves when every job enqueued so far has finished (used by tests). */
  onIdle(): Promise<void>;
}

/**
 * Fallback when Redis is not configured (local development and tests): runs each job
 * in the same process right after the response is sent. No persistence and no retries.
 */
export function createInlineQueue(handlers: JobHandlers, logger: Logger): InlineQueue {
  const pending = new Set<Promise<void>>();

  return {
    async enqueue(name, data) {
      const run = new Promise<void>((resolve) => setImmediate(resolve))
        .then(() => runHandler(handlers, name, data))
        .catch((err: unknown) => logger.error({ err, job: { name } }, "Job failed"))
        .finally(() => pending.delete(run));
      pending.add(run);
    },
    async onIdle() {
      while (pending.size > 0) await Promise.all(pending);
    },
    async close() {
      await this.onIdle();
    },
  };
}

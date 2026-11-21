import { describe, expect, it, vi } from "vitest";
import { createLogger } from "./logger.js";
import type { EmailMessage } from "./mailer.js";
import { createBullMqQueue, createInlineQueue, type JobHandlers } from "./queue.js";

const logger = createLogger("silent");
const message: EmailMessage = { to: "a@b.co", subject: "Hi", text: "Hi", html: "<p>Hi</p>" };

function recordingHandlers() {
  const emails: EmailMessage[] = [];
  const handlers: JobHandlers = {
    "email.send": async (data) => {
      emails.push(data);
    },
    "storage.delete": async () => {},
  };
  return { emails, handlers };
}

describe("inline queue", () => {
  it("runs jobs after the caller continues", async () => {
    const { emails, handlers } = recordingHandlers();
    const queue = createInlineQueue(handlers, logger);

    await queue.enqueue("email.send", message);
    expect(emails).toHaveLength(0);
    await queue.onIdle();
    expect(emails).toEqual([message]);
  });

  it("logs failures instead of crashing the request", async () => {
    const failing: JobHandlers = {
      "email.send": async () => {
        throw new Error("SMTP down");
      },
      "storage.delete": async () => {},
    };
    const errorSpy = vi.spyOn(logger, "error");
    const queue = createInlineQueue(failing, logger);

    await queue.enqueue("email.send", message);
    await queue.onIdle();
    expect(errorSpy).toHaveBeenCalled();
  });
});

/** Needs a real Redis (CI starts one). */
const redisUrl = process.env.TEST_REDIS_URL;
describe.skipIf(!redisUrl)("BullMQ queue (integration)", () => {
  it("processes jobs through Redis", async () => {
    const { emails, handlers } = recordingHandlers();
    const queue = createBullMqQueue(redisUrl as string, handlers, logger);

    try {
      await queue.enqueue("email.send", message);
      await vi.waitFor(() => expect(emails).toEqual([message]), { timeout: 10_000 });
    } finally {
      await queue.close();
    }
  });
});

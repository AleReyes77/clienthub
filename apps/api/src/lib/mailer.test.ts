import type { AddressInfo } from "node:net";
import { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSmtpMailer } from "./mailer.js";

/** Runs a real SMTP server in-process to test the SMTP adapter end to end. */
describe("SMTP mailer", () => {
  const received: string[] = [];
  let server: SMTPServer;
  let port: number;

  beforeAll(async () => {
    server = new SMTPServer({
      authOptional: true,
      disabledCommands: ["STARTTLS"],
      onData(stream, _session, callback) {
        let data = "";
        stream.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        stream.on("end", () => {
          received.push(data);
          callback();
        });
      },
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.server.address() as AddressInfo).port;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("delivers a message with the configured sender", async () => {
    const mailer = createSmtpMailer(`smtp://127.0.0.1:${port}`, "ClientHub <no-reply@test.dev>");
    await mailer.send({
      to: "ana@example.com",
      subject: "Hello",
      text: "Plain text body",
      html: "<p>HTML body</p>",
    });

    expect(received).toHaveLength(1);
    const message = received[0] ?? "";
    expect(message).toContain("From: ClientHub <no-reply@test.dev>");
    expect(message).toContain("To: ana@example.com");
    expect(message).toContain("Subject: Hello");
    expect(message).toContain("Plain text body");
  });
});

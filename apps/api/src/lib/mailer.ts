import nodemailer from "nodemailer";
import type { Logger } from "./logger.js";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

/** Sends through any SMTP server (Mailpit locally; SES, Postmark, Resend… in production). */
export function createSmtpMailer(smtpUrl: string, from: string): Mailer {
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    async send(message) {
      await transport.sendMail({ from, ...message });
    },
  };
}

/**
 * Development fallback: prints the email to the API log so links can be opened
 * without an SMTP server. Never used in production (config validation requires SMTP_URL).
 */
export function createConsoleMailer(logger: Logger): Mailer {
  return {
    async send(message) {
      logger.info(
        { email: { to: message.to, subject: message.subject } },
        `Email (not sent, no SMTP_URL configured):\n\n${message.text}\n`,
      );
    },
  };
}

/** Test double: keeps sent emails in memory. */
export class MemoryMailer implements Mailer {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.sent.push(message);
  }

  /** Last email sent to an address. */
  lastTo(to: string): EmailMessage | undefined {
    return this.sent.filter((m) => m.to === to).at(-1);
  }

  clear() {
    this.sent.length = 0;
  }
}

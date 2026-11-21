import { type Logger, pino } from "pino";

export type { Logger };

export function createLogger(level: string): Logger {
  return pino({
    level,
    // Never write credentials or session tokens to the logs.
    redact: {
      paths: [
        "req.headers.cookie",
        "req.headers.authorization",
        'res.headers["set-cookie"]',
        "*.password",
        "*.token",
      ],
      censor: "[REDACTED]",
    },
  });
}

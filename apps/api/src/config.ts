import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof envSchema>;

export interface Config extends Env {
  isProduction: boolean;
  /** `__Host-` cookies must be Secure, so the prefix is only used in production (HTTPS). */
  sessionCookieName: string;
  sessionTtlMs: number;
}

/** Validates environment variables once at startup and fails fast with a clear message. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join("\n")}`);
  }

  const values = parsed.data;
  const isProduction = values.NODE_ENV === "production";
  return {
    ...values,
    isProduction,
    sessionCookieName: isProduction ? "__Host-clienthub_session" : "clienthub_session",
    sessionTtlMs: values.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

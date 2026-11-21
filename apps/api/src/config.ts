import { z } from "zod";

/** Empty values in .env files ("SMTP_URL=") count as "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(10),

    // Background jobs and shared rate limiting. Without Redis, jobs run in-process.
    REDIS_URL: optional(z.url()),

    // Email. Without SMTP, emails are printed to the API log (development only).
    SMTP_URL: optional(z.url()),
    MAIL_FROM: z.string().default("ClientHub <no-reply@clienthub.local>"),

    // File storage. Without S3_BUCKET, files are stored on the local disk in UPLOAD_DIR.
    UPLOAD_DIR: z.string().default("uploads"),
    MAX_UPLOAD_MB: z.coerce.number().int().positive().max(100).default(10),
    S3_BUCKET: optional(z.string().min(1)),
    S3_REGION: z.string().default("us-east-1"),
    S3_ENDPOINT: optional(z.url()),
    S3_ACCESS_KEY_ID: optional(z.string().min(1)),
    S3_SECRET_ACCESS_KEY: optional(z.string().min(1)),
    S3_FORCE_PATH_STYLE: z.stringbool().default(false),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.SMTP_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_URL"],
        message: "SMTP_URL is required in production (emails cannot be printed to the log)",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export interface Config extends Env {
  isProduction: boolean;
  /** `__Host-` cookies must be Secure, so the prefix is only used in production (HTTPS). */
  sessionCookieName: string;
  sessionTtlMs: number;
  maxUploadBytes: number;
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
    maxUploadBytes: values.MAX_UPLOAD_MB * 1024 * 1024,
  };
}

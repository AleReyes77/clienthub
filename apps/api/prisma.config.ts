import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on variables from the environment (CI, production).
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // `prisma generate` does not need a database, so a missing URL is only an error for commands that connect.
    url: process.env.DATABASE_URL ?? "",
  },
});

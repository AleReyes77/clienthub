import cookieParser from "cookie-parser";
import express, { Router } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { Config } from "./config.js";
import type { Logger } from "./lib/logger.js";
import type { PrismaClient } from "./lib/prisma.js";
import { loadSession, requireAuth } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requireMembership } from "./middleware/membership.js";
import { originCheck } from "./middleware/origin-check.js";
import { createApiRateLimiter } from "./middleware/rate-limit.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { membersRouter } from "./modules/members/members.routes.js";
import {
  organizationDetailRouter,
  organizationsRouter,
} from "./modules/organizations/organizations.routes.js";
import { projectsRouter } from "./modules/projects/projects.routes.js";
import { tasksRouter } from "./modules/tasks/tasks.routes.js";

export interface AppDependencies {
  config: Config;
  prisma: PrismaClient;
  logger: Logger;
}

/**
 * Builds the Express app. Dependencies are passed in (not imported as singletons)
 * so tests can create an app against a dedicated test database.
 */
export function createApp({ config, prisma, logger }: AppDependencies) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY);

  app.use(helmet());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === "/health" },
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/health", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  });

  const api = Router();
  api.use(createApiRateLimiter());
  api.use(originCheck([config.WEB_ORIGIN]));
  api.use(loadSession(prisma, config));

  api.use("/auth", authRouter(prisma, config));
  api.use(organizationsRouter(prisma));

  // Everything under /orgs/:orgId requires a session and a membership in that organization.
  const org = Router({ mergeParams: true });
  org.use(organizationDetailRouter(prisma));
  org.use(membersRouter(prisma));
  org.use(projectsRouter(prisma));
  org.use(tasksRouter(prisma));
  api.use("/orgs/:orgId", requireAuth, requireMembership(prisma), org);

  app.use("/api/v1", api);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}

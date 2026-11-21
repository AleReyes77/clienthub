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
import { createApiRateLimiter, createRedisStoreFactory } from "./middleware/rate-limit.js";
import { auditRouter } from "./modules/audit/audit.routes.js";
import { createAuditService } from "./modules/audit/audit.service.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { filesRouter } from "./modules/files/files.routes.js";
import { membersRouter } from "./modules/members/members.routes.js";
import { createNotifier } from "./modules/notifications/notifier.js";
import {
  organizationDetailRouter,
  organizationsRouter,
} from "./modules/organizations/organizations.routes.js";
import { projectsRouter } from "./modules/projects/projects.routes.js";
import { tasksRouter } from "./modules/tasks/tasks.routes.js";
import type { Services } from "./services.js";

export interface AppDependencies {
  config: Config;
  prisma: PrismaClient;
  logger: Logger;
  services: Services;
  /** Prefix for Redis rate-limit keys (tests use a unique one per app). */
  rateLimitPrefix?: string;
}

/**
 * Builds the Express app. Dependencies are passed in (not imported as singletons)
 * so tests can create an app with a test database and in-memory services.
 */
export function createApp({ config, prisma, logger, services, rateLimitPrefix }: AppDependencies) {
  const app = express();
  const { queue, storage } = services;
  const audit = createAuditService(prisma);
  const notifier = createNotifier(queue, config.WEB_ORIGIN);
  const rateLimitStore = services.redis
    ? createRedisStoreFactory(services.redis, rateLimitPrefix)
    : undefined;

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
  api.use(createApiRateLimiter(rateLimitStore?.("api")));
  api.use(originCheck([config.WEB_ORIGIN]));
  api.use(loadSession(prisma, config));

  api.use("/auth", authRouter({ prisma, config, logger, notifier, rateLimitStore }));
  api.use(organizationsRouter(prisma, audit));

  // Everything under /orgs/:orgId requires a session and a membership in that organization.
  const org = Router({ mergeParams: true });
  org.use(organizationDetailRouter(prisma));
  org.use(membersRouter(prisma, audit, notifier));
  org.use(projectsRouter(prisma, audit, queue));
  org.use(tasksRouter(prisma, audit, notifier));
  org.use(filesRouter({ prisma, config, storage, queue, audit }));
  org.use(auditRouter(audit));
  api.use("/orgs/:orgId", requireAuth, requireMembership(prisma), org);

  app.use("/api/v1", api);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}

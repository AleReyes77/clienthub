import { Router } from "express";
import { authorize } from "../../middleware/membership.js";
import type { AuditService } from "./audit.service.js";

/** Mounted under `/orgs/:orgId`. */
export function auditRouter(audit: AuditService) {
  const router = Router();

  router.get("/audit-logs", async (req, res) => {
    const membership = authorize(req, "audit:read");
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    res.json(await audit.list(membership.organizationId, cursor));
  });

  return router;
}

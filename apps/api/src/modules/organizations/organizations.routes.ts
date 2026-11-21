import { createOrganizationSchema } from "@clienthub/shared";
import { Router } from "express";
import type { PrismaClient } from "../../lib/prisma.js";
import { parse } from "../../lib/validate.js";
import { getAuth } from "../../middleware/auth.js";
import { getMembership } from "../../middleware/membership.js";
import { createOrganizationsService } from "./organizations.service.js";

/**
 * Routes that are not scoped to one organization.
 * `getAuth()` throws a 401 when there is no session.
 */
export function organizationsRouter(prisma: PrismaClient) {
  const router = Router();
  const organizations = createOrganizationsService(prisma);

  router.get("/orgs", async (req, res) => {
    res.json({ organizations: await organizations.listForUser(getAuth(req).user.id) });
  });

  router.post("/orgs", async (req, res) => {
    const { user } = getAuth(req);
    const { name } = parse(createOrganizationSchema, req.body);
    res.status(201).json({ organization: await organizations.create(user.id, name) });
  });

  router.get("/invitations/:token", async (req, res) => {
    res.json({ invitation: await organizations.previewInvitation(req.params.token) });
  });

  router.post("/invitations/:token/accept", async (req, res) => {
    const organization = await organizations.acceptInvitation(getAuth(req).user, req.params.token);
    res.json({ organization });
  });

  return router;
}

/** `GET /orgs/:orgId` — mounted on the organization-scoped router. */
export function organizationDetailRouter(prisma: PrismaClient) {
  const router = Router();
  const organizations = createOrganizationsService(prisma);

  router.get("/", async (req, res) => {
    res.json({ organization: await organizations.getForMember(getMembership(req).id) });
  });

  return router;
}

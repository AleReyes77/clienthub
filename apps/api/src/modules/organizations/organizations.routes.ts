import { createOrganizationSchema } from "@clienthub/shared";
import { Router } from "express";
import type { PrismaClient } from "../../lib/prisma.js";
import { parse } from "../../lib/validate.js";
import { getAuth } from "../../middleware/auth.js";
import { getMembership } from "../../middleware/membership.js";
import type { AuditService } from "../audit/audit.service.js";
import { createOrganizationsService } from "./organizations.service.js";

/**
 * Routes that are not scoped to one organization.
 * `getAuth()` throws a 401 when there is no session.
 */
export function organizationsRouter(prisma: PrismaClient, audit: AuditService) {
  const router = Router();
  const organizations = createOrganizationsService(prisma);

  router.get("/orgs", async (req, res) => {
    res.json({ organizations: await organizations.listForUser(getAuth(req).user.id) });
  });

  router.post("/orgs", async (req, res) => {
    const { user } = getAuth(req);
    const { name } = parse(createOrganizationSchema, req.body);
    const organization = await organizations.create(user.id, name);
    await audit.recordFromRequest(
      req,
      { action: "organization.created", targetType: "organization", targetId: organization.id },
      organization.id,
    );
    res.status(201).json({ organization });
  });

  router.get("/invitations/:token", async (req, res) => {
    res.json({ invitation: await organizations.previewInvitation(req.params.token) });
  });

  router.post("/invitations/:token/accept", async (req, res) => {
    const organization = await organizations.acceptInvitation(getAuth(req).user, req.params.token);
    await audit.recordFromRequest(
      req,
      {
        action: "member.joined",
        targetType: "membership",
        targetId: organization.membershipId,
        metadata: { role: organization.role },
      },
      organization.id,
    );
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

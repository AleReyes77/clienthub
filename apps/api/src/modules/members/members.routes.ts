import { createInvitationSchema, updateMemberRoleSchema } from "@clienthub/shared";
import { Router } from "express";
import type { PrismaClient } from "../../lib/prisma.js";
import { parse } from "../../lib/validate.js";
import { getAuth } from "../../middleware/auth.js";
import { authorize } from "../../middleware/membership.js";
import { createMembersService } from "./members.service.js";

/** Mounted under `/orgs/:orgId`. */
export function membersRouter(prisma: PrismaClient) {
  const router = Router();
  const members = createMembersService(prisma);

  router.get("/members", async (req, res) => {
    const membership = authorize(req, "members:read");
    res.json({ members: await members.list(membership.organizationId) });
  });

  router.patch("/members/:membershipId", async (req, res) => {
    const membership = authorize(req, "members:manage");
    const { role } = parse(updateMemberRoleSchema, req.body);
    await members.updateRole(membership, req.params.membershipId, role);
    res.status(204).end();
  });

  router.delete("/members/:membershipId", async (req, res) => {
    const membership = authorize(req, "members:manage");
    await members.remove(membership, req.params.membershipId);
    res.status(204).end();
  });

  router.get("/invitations", async (req, res) => {
    const membership = authorize(req, "members:manage");
    res.json({ invitations: await members.listInvitations(membership.organizationId) });
  });

  router.post("/invitations", async (req, res) => {
    const membership = authorize(req, "members:manage");
    const input = parse(createInvitationSchema, req.body);
    const invitation = await members.invite(membership, getAuth(req).user.id, input);
    res.status(201).json({ invitation });
  });

  router.delete("/invitations/:invitationId", async (req, res) => {
    const membership = authorize(req, "members:manage");
    await members.revokeInvitation(membership.organizationId, req.params.invitationId);
    res.status(204).end();
  });

  return router;
}

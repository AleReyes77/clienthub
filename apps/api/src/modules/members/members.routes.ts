import { createInvitationSchema, updateMemberRoleSchema } from "@clienthub/shared";
import { Router } from "express";
import type { PrismaClient } from "../../lib/prisma.js";
import { parse } from "../../lib/validate.js";
import { getAuth } from "../../middleware/auth.js";
import { authorize } from "../../middleware/membership.js";
import type { AuditService } from "../audit/audit.service.js";
import type { Notifier } from "../notifications/notifier.js";
import { createMembersService } from "./members.service.js";

/** Mounted under `/orgs/:orgId`. */
export function membersRouter(prisma: PrismaClient, audit: AuditService, notifier: Notifier) {
  const router = Router();
  const members = createMembersService(prisma, notifier);

  router.get("/members", async (req, res) => {
    const membership = authorize(req, "members:read");
    res.json({ members: await members.list(membership.organizationId) });
  });

  router.patch("/members/:membershipId", async (req, res) => {
    const membership = authorize(req, "members:manage");
    const { role } = parse(updateMemberRoleSchema, req.body);
    const { previousRole, email } = await members.updateRole(
      membership,
      req.params.membershipId,
      role,
    );
    await audit.recordFromRequest(req, {
      action: "member.role_changed",
      targetType: "membership",
      targetId: req.params.membershipId,
      metadata: { email, from: previousRole, to: role },
    });
    res.status(204).end();
  });

  router.delete("/members/:membershipId", async (req, res) => {
    const membership = authorize(req, "members:manage");
    const removed = await members.remove(membership, req.params.membershipId);
    await audit.recordFromRequest(req, {
      action: "member.removed",
      targetType: "membership",
      targetId: req.params.membershipId,
      metadata: removed,
    });
    res.status(204).end();
  });

  router.get("/invitations", async (req, res) => {
    const membership = authorize(req, "members:manage");
    res.json({ invitations: await members.listInvitations(membership.organizationId) });
  });

  router.post("/invitations", async (req, res) => {
    const membership = authorize(req, "members:manage");
    const input = parse(createInvitationSchema, req.body);
    const invitation = await members.invite(membership, getAuth(req).user, input);
    await audit.recordFromRequest(req, {
      action: "invitation.created",
      targetType: "invitation",
      targetId: invitation.id,
      metadata: { email: invitation.email, role: invitation.role },
    });
    res.status(201).json({ invitation });
  });

  router.delete("/invitations/:invitationId", async (req, res) => {
    const membership = authorize(req, "members:manage");
    const revoked = await members.revokeInvitation(
      membership.organizationId,
      req.params.invitationId,
    );
    await audit.recordFromRequest(req, {
      action: "invitation.revoked",
      targetType: "invitation",
      targetId: revoked.id,
      metadata: { email: revoked.email },
    });
    res.status(204).end();
  });

  return router;
}

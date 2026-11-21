import {
  type CreatedInvitationDto,
  canManageMember,
  type createInvitationSchema,
  type InvitableRole,
  type InvitationDto,
  type MemberDto,
  type Role,
} from "@clienthub/shared";
import type { z } from "zod";
import { conflict, forbidden, notFound } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { generateToken, hashToken } from "../../lib/tokens.js";
import type { Notifier } from "../notifications/notifier.js";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface Actor {
  id: string;
  organizationId: string;
  role: Role;
}

function toInvitationDto(invitation: {
  id: string;
  email: string;
  role: Role;
  expiresAt: Date;
  createdAt: Date;
}): InvitationDto {
  return {
    id: invitation.id,
    email: invitation.email,
    // Invitations can never be created with OWNER (enforced by the schema).
    role: invitation.role as InvitableRole,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  };
}

export function createMembersService(prisma: PrismaClient, notifier: Notifier) {
  /**
   * Note on "last owner" safety: members cannot change or remove themselves and only owners
   * can change other owners, so an organization can never be left without an owner.
   */
  async function findManageableTarget(actor: Actor, targetMembershipId: string, newRole?: Role) {
    const target = await prisma.membership.findFirst({
      where: { id: targetMembershipId, organizationId: actor.organizationId },
      select: { id: true, role: true, user: { select: { email: true } } },
    });
    if (!target) throw notFound("Member");

    const allowed = canManageMember({
      actorRole: actor.role,
      actorMembershipId: actor.id,
      targetRole: target.role,
      targetMembershipId: target.id,
      ...(newRole ? { newRole } : {}),
    });
    if (!allowed) throw forbidden("You cannot change this member");
    return target;
  }

  return {
    async list(organizationId: string): Promise<MemberDto[]> {
      const memberships = await prisma.membership.findMany({
        where: { organizationId },
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      return memberships.map((m) => ({
        membershipId: m.id,
        role: m.role,
        user: m.user,
        joinedAt: m.createdAt.toISOString(),
      }));
    },

    /** Returns the previous role, for the audit log. */
    async updateRole(actor: Actor, targetMembershipId: string, role: Role) {
      const target = await findManageableTarget(actor, targetMembershipId, role);
      await prisma.membership.update({ where: { id: target.id }, data: { role } });
      return { previousRole: target.role, email: target.user.email };
    },

    async remove(actor: Actor, targetMembershipId: string) {
      const target = await findManageableTarget(actor, targetMembershipId);
      await prisma.membership.delete({ where: { id: target.id } });
      return { role: target.role, email: target.user.email };
    },

    async listInvitations(organizationId: string): Promise<InvitationDto[]> {
      const invitations = await prisma.invitation.findMany({
        where: { organizationId, acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      });
      return invitations.map(toInvitationDto);
    },

    async invite(
      actor: Actor,
      inviter: { id: string; name: string },
      input: z.output<typeof createInvitationSchema>,
    ): Promise<CreatedInvitationDto> {
      const alreadyMember = await prisma.membership.findFirst({
        where: { organizationId: actor.organizationId, user: { email: input.email } },
      });
      if (alreadyMember) {
        throw conflict("ALREADY_MEMBER", "This person is already a member of the organization");
      }

      const token = generateToken();
      // Re-inviting the same email replaces any previous pending invitation.
      const [, invitation] = await prisma.$transaction([
        prisma.invitation.deleteMany({
          where: { organizationId: actor.organizationId, email: input.email, acceptedAt: null },
        }),
        prisma.invitation.create({
          data: {
            organizationId: actor.organizationId,
            email: input.email,
            role: input.role,
            tokenHash: hashToken(token),
            invitedById: inviter.id,
            expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
          },
        }),
      ]);

      const organization = await prisma.organization.findUniqueOrThrow({
        where: { id: actor.organizationId },
        select: { name: true },
      });
      await notifier.invitation({
        email: input.email,
        role: input.role,
        organizationName: organization.name,
        inviterName: inviter.name,
        token,
      });

      return { ...toInvitationDto(invitation), token };
    },

    async revokeInvitation(organizationId: string, invitationId: string) {
      const invitation = await prisma.invitation.findFirst({
        where: { id: invitationId, organizationId, acceptedAt: null },
        select: { id: true, email: true },
      });
      if (!invitation) throw notFound("Invitation");
      await prisma.invitation.delete({ where: { id: invitation.id } });
      return invitation;
    },
  };
}

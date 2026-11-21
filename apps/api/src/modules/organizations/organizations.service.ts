import type { OrganizationDto, Role } from "@clienthub/shared";
import { AppError, conflict, forbidden, notFound } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { hashToken } from "../../lib/tokens.js";

interface MembershipWithOrg {
  id: string;
  role: Role;
  organization: { id: string; name: string; createdAt: Date };
}

const membershipWithOrg = {
  id: true,
  role: true,
  organization: { select: { id: true, name: true, createdAt: true } },
} as const;

function toOrganizationDto(membership: MembershipWithOrg): OrganizationDto {
  return {
    id: membership.organization.id,
    name: membership.organization.name,
    role: membership.role,
    membershipId: membership.id,
    createdAt: membership.organization.createdAt.toISOString(),
  };
}

export function createOrganizationsService(prisma: PrismaClient) {
  async function findValidInvitation(token: string) {
    const invitation = await prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { organization: { select: { id: true, name: true } } },
    });
    if (!invitation) throw notFound("Invitation");
    if (invitation.acceptedAt) {
      throw new AppError(410, "INVITATION_USED", "This invitation was already used");
    }
    if (invitation.expiresAt < new Date()) {
      throw new AppError(410, "INVITATION_EXPIRED", "This invitation has expired");
    }
    return invitation;
  }

  return {
    async listForUser(userId: string): Promise<OrganizationDto[]> {
      const memberships = await prisma.membership.findMany({
        where: { userId },
        select: membershipWithOrg,
        orderBy: { createdAt: "asc" },
      });
      return memberships.map(toOrganizationDto);
    },

    async create(userId: string, name: string): Promise<OrganizationDto> {
      // The creator becomes the first OWNER, in the same transaction.
      const membership = await prisma.membership.create({
        data: {
          role: "OWNER",
          user: { connect: { id: userId } },
          organization: { create: { name } },
        },
        select: membershipWithOrg,
      });
      return toOrganizationDto(membership);
    },

    async getForMember(membershipId: string): Promise<OrganizationDto> {
      const membership = await prisma.membership.findUniqueOrThrow({
        where: { id: membershipId },
        select: membershipWithOrg,
      });
      return toOrganizationDto(membership);
    },

    /** Public preview shown on the invitation page. The token itself is the secret. */
    async previewInvitation(token: string) {
      const invitation = await findValidInvitation(token);
      return {
        organizationName: invitation.organization.name,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
      };
    },

    async acceptInvitation(
      user: { id: string; email: string },
      token: string,
    ): Promise<OrganizationDto> {
      const invitation = await findValidInvitation(token);

      // An invitation link only works for the email it was sent to.
      if (invitation.email !== user.email) {
        throw forbidden(
          "This invitation was sent to a different email address",
          "INVITATION_EMAIL_MISMATCH",
        );
      }

      const existing = await prisma.membership.findUnique({
        where: {
          userId_organizationId: { userId: user.id, organizationId: invitation.organizationId },
        },
      });
      if (existing)
        throw conflict("ALREADY_MEMBER", "You are already a member of this organization");

      const [membership] = await prisma.$transaction([
        prisma.membership.create({
          data: {
            userId: user.id,
            organizationId: invitation.organizationId,
            role: invitation.role,
          },
          select: membershipWithOrg,
        }),
        prisma.invitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        }),
      ]);
      return toOrganizationDto(membership);
    },
  };
}

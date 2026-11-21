/**
 * Role-based access control (RBAC) for an organization.
 *
 * Every member of an organization has exactly one role. Permissions are
 * granted per role and checked on the API for every request; the web app
 * only uses them to hide actions the user cannot perform.
 */
export const ROLES = ["OWNER", "ADMIN", "MEMBER", "CLIENT"] as const;
export type Role = (typeof ROLES)[number];

/** Roles that can be given through an invitation. Ownership is never granted by invite. */
export const INVITABLE_ROLES = ["ADMIN", "MEMBER", "CLIENT"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const PERMISSIONS = {
  "members:read": ["OWNER", "ADMIN", "MEMBER"],
  "members:manage": ["OWNER", "ADMIN"],
  "projects:readAll": ["OWNER", "ADMIN", "MEMBER"],
  "projects:create": ["OWNER", "ADMIN"],
  "projects:update": ["OWNER", "ADMIN"],
  "projects:delete": ["OWNER", "ADMIN"],
  "tasks:create": ["OWNER", "ADMIN", "MEMBER"],
  "tasks:update": ["OWNER", "ADMIN", "MEMBER"],
  "tasks:delete": ["OWNER", "ADMIN", "MEMBER"],
  // Clients can share files (briefs, assets) on their own projects.
  "files:upload": ["OWNER", "ADMIN", "MEMBER", "CLIENT"],
  // Anyone can delete the files they uploaded; these roles can delete any file.
  "files:deleteAny": ["OWNER", "ADMIN"],
  "audit:read": ["OWNER", "ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/**
 * Rules for changing another member's role or removing them:
 * - Nobody can change their own role (avoids accidental lock-out).
 * - Only an OWNER can modify another OWNER or promote someone to OWNER.
 * - ADMINs can manage ADMIN, MEMBER and CLIENT members.
 */
export function canManageMember(params: {
  actorRole: Role;
  actorMembershipId: string;
  targetRole: Role;
  targetMembershipId: string;
  newRole?: Role;
}): boolean {
  const { actorRole, actorMembershipId, targetRole, targetMembershipId, newRole } = params;

  if (!can(actorRole, "members:manage")) return false;
  if (actorMembershipId === targetMembershipId) return false;
  if (actorRole === "OWNER") return true;

  // From here the actor is an ADMIN.
  if (targetRole === "OWNER") return false;
  if (newRole === "OWNER") return false;
  return true;
}

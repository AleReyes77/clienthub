import { describe, expect, it } from "vitest";
import { can, canManageMember } from "./roles";

describe("can", () => {
  it("lets owners and admins manage members", () => {
    expect(can("OWNER", "members:manage")).toBe(true);
    expect(can("ADMIN", "members:manage")).toBe(true);
    expect(can("MEMBER", "members:manage")).toBe(false);
    expect(can("CLIENT", "members:manage")).toBe(false);
  });

  it("lets members work on tasks but not create projects", () => {
    expect(can("MEMBER", "tasks:create")).toBe(true);
    expect(can("MEMBER", "projects:create")).toBe(false);
  });

  it("gives clients no write permissions", () => {
    const writePermissions = [
      "members:manage",
      "projects:create",
      "projects:update",
      "projects:delete",
      "tasks:create",
      "tasks:update",
      "tasks:delete",
    ] as const;
    for (const permission of writePermissions) {
      expect(can("CLIENT", permission)).toBe(false);
    }
  });
});

describe("canManageMember", () => {
  const base = { actorMembershipId: "actor", targetMembershipId: "target" };

  it("never allows changing your own membership", () => {
    expect(
      canManageMember({
        ...base,
        actorRole: "OWNER",
        targetRole: "OWNER",
        targetMembershipId: "actor",
      }),
    ).toBe(false);
  });

  it("allows an owner to manage anyone else", () => {
    expect(canManageMember({ ...base, actorRole: "OWNER", targetRole: "OWNER" })).toBe(true);
    expect(
      canManageMember({ ...base, actorRole: "OWNER", targetRole: "MEMBER", newRole: "OWNER" }),
    ).toBe(true);
  });

  it("stops an admin from touching owners or creating owners", () => {
    expect(canManageMember({ ...base, actorRole: "ADMIN", targetRole: "OWNER" })).toBe(false);
    expect(
      canManageMember({ ...base, actorRole: "ADMIN", targetRole: "MEMBER", newRole: "OWNER" }),
    ).toBe(false);
    expect(
      canManageMember({ ...base, actorRole: "ADMIN", targetRole: "MEMBER", newRole: "CLIENT" }),
    ).toBe(true);
  });

  it("stops members and clients from managing anyone", () => {
    expect(canManageMember({ ...base, actorRole: "MEMBER", targetRole: "CLIENT" })).toBe(false);
    expect(canManageMember({ ...base, actorRole: "CLIENT", targetRole: "CLIENT" })).toBe(false);
  });
});

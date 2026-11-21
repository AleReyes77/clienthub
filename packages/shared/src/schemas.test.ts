import { describe, expect, it } from "vitest";
import { createInvitationSchema, createTaskSchema, registerSchema } from "./schemas";

describe("registerSchema", () => {
  it("normalizes the email", () => {
    const result = registerSchema.parse({
      name: "Ana",
      email: "  Ana@Example.COM ",
      password: "a-long-enough-password",
    });
    expect(result.email).toBe("ana@example.com");
  });

  it("rejects short passwords", () => {
    const result = registerSchema.safeParse({
      name: "Ana",
      email: "ana@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });
});

describe("createInvitationSchema", () => {
  it("does not allow inviting someone as owner", () => {
    const result = createInvitationSchema.safeParse({ email: "a@b.co", role: "OWNER" });
    expect(result.success).toBe(false);
  });
});

describe("createTaskSchema", () => {
  it("accepts a YYYY-MM-DD due date and turns empty descriptions into undefined", () => {
    const result = createTaskSchema.parse({
      title: "Design homepage",
      description: "   ",
      dueDate: "2026-12-01",
    });
    expect(result.description).toBeUndefined();
    expect(result.dueDate).toBe("2026-12-01");
  });

  it("rejects invalid dates", () => {
    expect(createTaskSchema.safeParse({ title: "Task", dueDate: "01/12/2026" }).success).toBe(
      false,
    );
  });
});

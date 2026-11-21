import { z } from "zod";
import { INVITABLE_ROLES, ROLES } from "./roles";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "Enter a valid email address" }).max(254));

/**
 * Password policy (OWASP ASVS / NIST 800-63B): length over complexity.
 * At least 12 characters, at most 128 to avoid hashing very large inputs.
 */
const password = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters");

const id = z.string().min(1).max(64);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

// ── Auth ────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  email,
  password,
});
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  // Do not enforce the policy on login: only check it is present and bounded.
  password: z.string().min(1, "Password is required").max(128),
});
export type LoginInput = z.input<typeof loginSchema>;

/** Tokens from email links (verify email, reset password). */
const emailToken = z.string().min(20, "This link is not valid").max(200, "This link is not valid");

export const verifyEmailSchema = z.object({ token: emailToken });
export type VerifyEmailInput = z.input<typeof verifyEmailSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({ token: emailToken, password });
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

// ── Organizations & members ─────────────────────────────────────────────

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
});
export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;

export const createInvitationSchema = z.object({
  email,
  role: z.enum(INVITABLE_ROLES),
});
export type CreateInvitationInput = z.input<typeof createInvitationSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum(ROLES),
});
export type UpdateMemberRoleInput = z.input<typeof updateMemberRoleSchema>;

// ── Projects ────────────────────────────────────────────────────────────

export const PROJECT_STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const createProjectSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  description: optionalText(2000),
  clientMembershipId: id.optional(),
});
export type CreateProjectInput = z.input<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).nullable(),
    status: z.enum(PROJECT_STATUSES),
    clientMembershipId: id.nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, "Provide at least one field to update");
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;

// ── Tasks ───────────────────────────────────────────────────────────────

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Dates travel as "YYYY-MM-DD" strings, the format of <input type="date">. */
const dueDate = z.iso.date({ message: "Use the format YYYY-MM-DD" });

export const createTaskSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(200),
  description: optionalText(5000),
  assigneeMembershipId: id.optional(),
  dueDate: dueDate.optional(),
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(5000).nullable(),
    status: z.enum(TASK_STATUSES),
    assigneeMembershipId: id.nullable(),
    dueDate: dueDate.nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, "Provide at least one field to update");
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;

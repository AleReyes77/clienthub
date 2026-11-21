import type { z } from "zod";
import { ApiError } from "./api";

export type FieldErrors = Record<string, string>;

/**
 * Validates form data with the same Zod schema the API uses,
 * so users get instant feedback and the rules live in one place.
 */
export function validate<T extends z.ZodType>(
  schema: T,
  input: unknown,
): { data: z.output<T>; errors: null } | { data: null; errors: FieldErrors } {
  const result = schema.safeParse(input);
  if (result.success) return { data: result.data, errors: null };

  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".");
    errors[path] ??= issue.message;
  }
  return { data: null, errors };
}

/** Field errors returned by the API (400 VALIDATION_ERROR). */
export function serverFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiError)) return {};
  return Object.fromEntries(error.details.map((d) => [d.path, d.message]));
}

export function formValues(form: HTMLFormElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of new FormData(form)) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

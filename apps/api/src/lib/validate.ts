import type { z } from "zod";
import { validationError } from "./errors.js";

/** Parses untrusted input with a Zod schema or throws a 400 with field-level details. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

/** "2026-12-01" → Date at UTC midnight (matches PostgreSQL DATE columns). */
export function fromDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Date → "2026-12-01". */
export function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

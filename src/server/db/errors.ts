/** Postgres's SQLSTATE for a broken unique constraint. */
export const UNIQUE_VIOLATION = '23505'

export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === UNIQUE_VIOLATION
}

/** Postgres's SQLSTATE for a broken unique constraint. */
export const UNIQUE_VIOLATION = '23505'

export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === UNIQUE_VIOLATION
}

/** The unique constraint a refused write broke; drizzle wraps the driver's error, so its causes are read too. */
export function uniqueConstraintOf(error: unknown): string | undefined {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    const { code, constraint } = e as { code?: unknown; constraint?: unknown }

    if (code === UNIQUE_VIOLATION && typeof constraint === 'string') return constraint
  }

  return undefined
}

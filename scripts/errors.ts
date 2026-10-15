// How the scripts name an error in their one-line JSON logs: its own text, the innermost reason behind it, and the DETAIL
// Postgres adds to some refusals (a role that lacks a right, a row that breaks a constraint).

/**
 * An error's own text. Node tries every address of a host and, when all refuse, rejects with an AggregateError without a
 * message; its reasons are the errors it holds.
 */
export function messageOf(error: Error): string {
  if (!(error instanceof AggregateError) || error.message) return error.message

  return error.errors.map(e => (e instanceof Error ? e.message : String(e))).join('; ')
}

/** The innermost reason behind an error: "database unreachable after 5 attempts" may hide a refused password. */
function causeOf(error: unknown): string | undefined {
  let reason: string | undefined

  for (let e = error instanceof Error ? error.cause : undefined; e instanceof Error; e = e.cause) reason = messageOf(e)

  return reason
}

/** Postgres's DETAIL, from the error or the first of its causes that carries one. */
function detailOf(error: unknown): string | undefined {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    const detail = (e as { detail?: unknown }).detail

    if (typeof detail === 'string' && detail !== '') return detail
  }

  return undefined
}

/** The fields of a failure line: `message`, and `cause` and `detail` when the error has them. */
export function errorFields(error: unknown): { message: string; cause?: string; detail?: string } {
  const cause = causeOf(error)
  const detail = detailOf(error)

  return {
    message: error instanceof Error ? messageOf(error) : String(error),
    ...(cause === undefined ? {} : { cause }),
    ...(detail === undefined ? {} : { detail }),
  }
}

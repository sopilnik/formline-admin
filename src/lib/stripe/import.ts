// "Import missed Stripe orders" (spec §7.5): what the settings page and the server action share, without server code.

/** How far back the import looks: Stripe retries a webhook for three days, the import covers a month. */
export const IMPORT_DAYS = 30
/** The most sessions one import reads; the store's test checkout never comes near it. */
export const IMPORT_MAX_SESSIONS = 200

export type ImportSummary = {
  /** The numbers the owner workspace gave the imported orders, oldest first. */
  imported: number[]
  /** Paid sessions of the period the panel already had. */
  already: number
  /** Sessions the panel cannot keep: unpaid, another currency, amounts that do not add up. */
  skipped: number
  /** Stripe had more sessions in the period than one import reads. */
  more: boolean
}

export type ImportError = 'unavailable' | 'rate_limited' | 'reauth_required' | 'failed'

export type ImportState =
  | { status: 'idle' }
  | { status: 'error'; error: ImportError; retryAfterMinutes?: number }
  | ({ status: 'done' } & ImportSummary)

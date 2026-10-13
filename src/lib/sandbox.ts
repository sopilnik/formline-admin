/** Whole hours left until a sandbox expires — the banner's "at the latest" figure. */
export function hoursLeft(expiresAt: Date, nowMs: number = Date.now()): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - nowMs) / 3_600_000))
}

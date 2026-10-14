/** Hours left until a sandbox expires, rounded up — the banner's "at the latest" figure is never earlier than the deletion. */
export function hoursLeft(expiresAt: Date, nowMs: number = Date.now()): number {
  return Math.max(0, Math.ceil((expiresAt.getTime() - nowMs) / 3_600_000))
}

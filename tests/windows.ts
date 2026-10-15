// Rate limits count attempts in fixed windows aligned to the clock (src/server/ratelimit/consume.ts, and
// create_sandbox for the demo entries). A test that fills a window to its limit fails when its attempts straddle two
// windows, so it first makes sure the current window has room for it. The wait happens only near a window's end.

/** Milliseconds to wait until `seconds` of work fit inside one fixed window of `windowSeconds`; 0 when they fit now. */
export function waitForRoom(nowMs: number, windowSeconds: number, seconds: number): number {
  const windowMs = windowSeconds * 1000
  const left = windowMs - (nowMs % windowMs)

  return left > seconds * 1000 ? 0 : left + 250
}

/** Waits, when the current fixed window ends within `seconds`, until the next one has begun. */
export async function roomInWindow(windowSeconds: number, seconds: number): Promise<void> {
  const ms = waitForRoom(Date.now(), windowSeconds, seconds)

  if (ms > 0) await new Promise(resolve => setTimeout(resolve, ms))
}

import { unstable_rethrow } from 'next/navigation'

/**
 * Calls a server action and gives null when its request gets no answer — offline, aborted, a server error page — instead
 * of letting the failure reach the page's error boundary, which would replace the page and everything typed on it. A
 * redirect or a "not found" from the action still goes through.
 */
export async function reach<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call()
  } catch (error) {
    unstable_rethrow(error)

    return null
  }
}

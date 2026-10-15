import type { UploadError } from '@/lib/uploads'

/** A refused upload as the pickers show it: the error, and for a rate limit the minutes to wait. */
export type UploadProblem = { error: Exclude<UploadError, 'rate_limited'> } | { error: 'rate_limited'; minutes: number }

/**
 * Sends one image to its product: the file is the request body of `POST /api/media`. Null when the server
 * took it; otherwise what it refused, `unavailable` when no answer came.
 */
export async function sendProductImage(productId: string, file: File): Promise<UploadProblem | null> {
  const response = await fetch(`/api/media?product=${productId}`, { method: 'POST', body: file, headers: { 'X-Requested-With': 'formline' } }).catch(() => null)

  if (response?.status === 201) {
    return null
  }

  const body = response ? await response.json().catch(() => null) as { error?: UploadError } | null : null
  const error = body?.error ?? 'unavailable'

  if (error === 'rate_limited') {
    return { error, minutes: Math.max(1, Math.ceil(Number(response?.headers.get('Retry-After') ?? 60) / 60)) }
  }

  return { error }
}

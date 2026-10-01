import { stripeConfig } from '@/server/config'
import { readCapped } from '@/server/read-capped'
import { stripeGateway } from '@/server/stripe/gateway'
import { handleWebhook, WEBHOOK_MAX_BYTES } from '@/server/stripe/webhook'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * `POST /api/stripe/webhook`: the panel's own endpoint in the store's Stripe sandbox (spec §4.4, §7.1). No session and
 * no Origin check — Stripe proves the request with its signature over the raw body, which is why the body is read here
 * and nowhere parsed first.
 */
export async function POST(request: Request): Promise<Response> {
  const config = stripeConfig()
  if (!config) return Response.json({ received: false, error: 'unavailable' }, { status: 503, headers: NO_STORE })
  if (Number(request.headers.get('content-length') ?? 0) > WEBHOOK_MAX_BYTES) return Response.json({ received: false, error: 'too_large' }, { status: 413, headers: NO_STORE })
  const body = await readCapped(request.body, WEBHOOK_MAX_BYTES)
  if (body === 'too_large') return Response.json({ received: false, error: 'too_large' }, { status: 413, headers: NO_STORE })
  const answer = await handleWebhook({ body, signature: request.headers.get('stripe-signature') }, { config, gateway: stripeGateway(config) })
  return Response.json(answer.body, { status: answer.status, headers: NO_STORE })
}

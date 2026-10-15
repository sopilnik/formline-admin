// A stand-in for the two Stripe API reads the panel makes, on 127.0.0.1 only: the e2e server reaches it
// through STRIPE_API_BASE. A test registers the sessions it expects with POST /__stub/sessions; the stub forgets them
// when the run ends.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { E2E_STRIPE_ENV, E2E_STRIPE_PORT } from './constants.ts'

type Session = { id: string; created: number; status?: string }
type Fixture = { session: Session; lineItems: unknown[] }

const fixtures = new Map<string, Fixture>()
const missing = { error: { type: 'invalid_request_error', code: 'resource_missing', message: 'No such checkout session' } }

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []

  for await (const chunk of request) chunks.push(chunk as Buffer)

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${E2E_STRIPE_PORT}`)

  if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { ok: true })
  if (request.method === 'POST' && url.pathname === '/__stub/sessions') {
    const fixture = await readJson(request) as Fixture

    fixtures.set(fixture.session.id, fixture)

    return send(response, 201, { ok: true })
  }
  if (request.headers.authorization !== `Bearer ${E2E_STRIPE_ENV.STRIPE_RESTRICTED_KEY}`) {
    return send(response, 401, { error: { type: 'invalid_request_error', message: 'Invalid API Key provided' } })
  }

  const items = /^\/v1\/checkout\/sessions\/([^/]+)\/line_items$/.exec(url.pathname)

  if (request.method === 'GET' && items) {
    const fixture = fixtures.get(decodeURIComponent(items[1]!))

    if (!fixture) return send(response, 404, missing)

    return send(response, 200, { object: 'list', data: fixture.lineItems, has_more: false, url: url.pathname })
  }
  if (request.method === 'GET' && url.pathname === '/v1/checkout/sessions') {
    const since = Number(url.searchParams.get('created[gte]') ?? 0)
    const data = [...fixtures.values()].map(f => f.session)
      .filter(s => s.created >= since && (s.status ?? 'complete') === 'complete')
      .sort((a, b) => b.created - a.created)

    return send(response, 200, { object: 'list', data, has_more: false, url: url.pathname })
  }
  send(response, 404, missing)
}).listen(E2E_STRIPE_PORT, '127.0.0.1')

// One call to bunny's API with the account key: JSON both ways, a 20-second limit, and an error that names the method
// and the path with the application id masked, so a failed call never prints an id or a key.

export const BUNNY_API = 'https://api.bunny.net'

const ACCESS_KEY_HEADER = 'AccessKey'
const ACCEPT_HEADER = 'Accept'
const CONTENT_TYPE_HEADER = 'Content-Type'
const JSON_TYPE = 'application/json'
const REQUEST_TIMEOUT_MS = 20_000
const APP_ID_IN_PATH = /\/apps\/[^/]+/
const MASKED_APP_PATH = '/apps/{id}'

export type BunnyConnection = { fetch: typeof fetch; key: string; base?: string }
export type BunnyRequest = { method: 'GET' | 'POST' | 'PATCH'; path: string; body?: unknown }

function requestInit({ method, body }: BunnyRequest, key: string): RequestInit {
  const headers: Record<string, string> = { [ACCESS_KEY_HEADER]: key, [ACCEPT_HEADER]: JSON_TYPE }

  if (body) headers[CONTENT_TYPE_HEADER] = JSON_TYPE

  return { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
}

export async function bunnyApi(connection: BunnyConnection, request: BunnyRequest): Promise<unknown> {
  const base = connection.base ?? BUNNY_API
  const res = await connection.fetch(`${base}${request.path}`, requestInit(request, connection.key))

  if (!res.ok) throw new Error(`bunny ${request.method} ${request.path.replace(APP_ID_IN_PATH, MASKED_APP_PATH)}: HTTP ${res.status}`)

  const text = await res.text()

  return text ? JSON.parse(text) : null
}

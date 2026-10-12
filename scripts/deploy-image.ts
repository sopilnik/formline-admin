// Points the panel's container at the image deploy.yml has just pushed and waits until the new container answers
// (spec §13). It is our own call to bunny's API rather than bunny's container-update action, which sends its update
// without waiting for the answer and never learns how the rollout ends.

const API = 'https://api.bunny.net/mc'

type Fetch = typeof fetch

export type DeployOptions = {
  key: string
  appId: string
  /** The container's name in the application (the dashboard's "Container name"). */
  container: string
  /** The commit the image was built from: its tag, and the version liveness reports (Dockerfile, FORMLINE_VERSION). */
  tag: string
  digest: string
  siteUrl: string
  fetch: Fetch
  sleep(ms: number): Promise<void>
  now(): number
  log(event: Record<string, unknown>): void
  timeoutMs?: number
  pollMs?: number
}

type Template = { id: string; name: string }

async function api(o: DeployOptions, method: 'GET' | 'PATCH', path: string, body?: unknown): Promise<unknown> {
  const res = await o.fetch(`${API}${path}`, {
    method,
    headers: { AccessKey: o.key, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`bunny ${method} ${path.replace(/\/apps\/[^/]+/, '/apps/{id}')}: HTTP ${res.status}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

async function liveVersion(o: DeployOptions): Promise<string | null> {
  try {
    // A query of its own keeps any cache out of the way; through the edge it is still the liveness check.
    const res = await o.fetch(new URL(`/api/health?deploy=${encodeURIComponent(o.tag)}`, o.siteUrl), { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    const body = (await res.json()) as { version?: unknown }
    return typeof body.version === 'string' ? body.version : null
  } catch {
    return null
  }
}

/** The application's status, or null when bunny's API did not answer this time: one failed call never ends the wait. */
async function appStatus(o: DeployOptions): Promise<string | null> {
  try {
    const { status } = (await api(o, 'GET', `/apps/${o.appId}`)) as { status?: string }
    return status ?? null
  } catch (error) {
    o.log({ event: 'deploy.poll_error', message: error instanceof Error ? error.message : String(error) })
    return null
  }
}

export async function deployImage(o: DeployOptions): Promise<void> {
  const app = (await api(o, 'GET', `/apps/${o.appId}`)) as { containerTemplates?: Template[] }
  const templates = (app.containerTemplates ?? []).filter(t => t.name === o.container)
  if (templates.length !== 1) throw new Error(`expected one container named ${o.container}, found ${templates.length}`)
  await api(o, 'PATCH', `/apps/${o.appId}/containers/${templates[0]!.id}`, { imageTag: o.tag, imageDigest: o.digest })
  o.log({ event: 'deploy.updated', container: o.container, tag: o.tag })
  const deadline = o.now() + (o.timeoutMs ?? 15 * 60_000)
  for (;;) {
    const version = await liveVersion(o)
    if (version === o.tag) {
      o.log({ event: 'deploy.live', tag: o.tag })
      return
    }
    const status = await appStatus(o)
    if (status === 'failing' || status === 'suspended') throw new Error(`bunny reports the application ${status}`)
    if (o.now() >= deadline) throw new Error(`the panel still answers ${version ?? 'nothing'} instead of ${o.tag}`)
    await o.sleep(o.pollMs ?? 10_000)
  }
}

if (import.meta.main) {
  const env = process.env
  const missing = ['BUNNY_API_KEY', 'MC_APP_ID', 'MC_CONTAINER_NAME', 'IMAGE_TAG', 'IMAGE_DIGEST', 'SITE_URL'].filter(name => !env[name])
  const log = (event: Record<string, unknown>) => console.log(JSON.stringify(event))
  if (missing.length > 0) {
    log({ event: 'deploy.failed', message: `missing ${missing.join(', ')}` })
    process.exit(1)
  }
  deployImage({
    key: env.BUNNY_API_KEY!, appId: env.MC_APP_ID!, container: env.MC_CONTAINER_NAME!, tag: env.IMAGE_TAG!, digest: env.IMAGE_DIGEST!,
    siteUrl: env.SITE_URL!, fetch, sleep: ms => new Promise(resolve => setTimeout(resolve, ms)), now: () => Date.now(), log,
  }).then(
    () => process.exit(0),
    error => {
      log({ event: 'deploy.failed', message: error instanceof Error ? error.message : String(error) })
      process.exit(1)
    },
  )
}

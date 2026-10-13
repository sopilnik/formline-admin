// The hourly budget guard (.github/workflows/budget-guard.yml). It reads what the panel's application has cost
// this month and the account's balance from bunny's API, stops the application at $4, and fails — so GitHub emails the
// owner — whenever it stops the application, cannot read a figure, finds the balance under $1 or the panel silent.
// A stopped application is left alone: resuming it is the owner's step (README, "Budget guard").

export const COST_LIMIT_USD = 4
/** Below the account's automatic top-up ($10 whenever the balance falls under $2), so it fires only when a top-up failed. */
export const BALANCE_FLOOR_USD = 1

const API = 'https://api.bunny.net'

export type GuardFacts = {
  /** The application's status (bunny's `ApplicationStatus`); `inactive` once undeployed. */
  status: string
  /** `monthlyCost` of the application's usage summary. */
  appCost: unknown
  /** `MonthlyChargesMagicContainers` of the account's billing: every app, so never below the panel's own. */
  billingCost: unknown
  /** `Balance` of the account's billing: money paid in, without coupon credit that may expire. */
  balance: unknown
  live: boolean
}

export type Verdict = { undeploy: boolean; failures: string[]; cost: number | null }

const number = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/** What this run does: the larger of the two costs counts, and a figure it cannot read is a failure, never a pass. */
export function decide(facts: GuardFacts): Verdict {
  const failures: string[] = []
  const appCost = number(facts.appCost)
  const billingCost = number(facts.billingCost)
  if (appCost === null) failures.push('the usage summary carries no monthlyCost')
  if (billingCost === null) failures.push('the billing carries no MonthlyChargesMagicContainers')
  const cost = appCost === null && billingCost === null ? null : Math.max(appCost ?? 0, billingCost ?? 0)
  const undeploy = cost !== null && cost >= COST_LIMIT_USD
  if (undeploy) failures.push(`this month's cost $${cost.toFixed(2)} reached $${COST_LIMIT_USD}: the application is undeployed`)
  const balance = number(facts.balance)
  if (balance === null) failures.push('the billing carries no Balance')
  else if (balance < BALANCE_FLOOR_USD) failures.push(`the balance $${balance.toFixed(2)} is under $${BALANCE_FLOOR_USD}`)
  if (facts.status === 'suspended') failures.push('bunny reports the application suspended')
  if (!facts.live && !undeploy) failures.push('the panel does not answer its liveness check')
  return { undeploy, failures, cost }
}

type Fetch = typeof fetch

async function api(fetchImpl: Fetch, key: string, method: 'GET' | 'POST', path: string): Promise<unknown> {
  const res = await fetchImpl(`${API}${path}`, { method, headers: { AccessKey: key, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`bunny ${method} ${path.replace(/\/apps\/[^/]+/, '/apps/{id}')}: HTTP ${res.status}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

const field = (body: unknown, name: string): unknown => (body && typeof body === 'object' ? (body as Record<string, unknown>)[name] : undefined)

export type GuardOptions = { key: string; appId: string; siteUrl: string; fetch: Fetch; log: (event: Record<string, unknown>) => void }

/** One run; resolves with the exit code. */
export async function runGuard(o: GuardOptions): Promise<number> {
  try {
    const app = await api(o.fetch, o.key, 'GET', `/mc/apps/${o.appId}`)
    const status = String(field(app, 'status') ?? 'unknown')
    if (status === 'inactive') {
      o.log({ event: 'guard.stopped', status })
      return 0
    }
    const [summary, billing] = await Promise.all([
      api(o.fetch, o.key, 'GET', `/mc/apps/${o.appId}/summary`),
      api(o.fetch, o.key, 'GET', '/billing'),
    ])
    const live = await o.fetch(new URL('/api/health', o.siteUrl), { signal: AbortSignal.timeout(20_000) }).then(r => r.ok, () => false)
    const verdict = decide({ status, appCost: field(summary, 'monthlyCost'), billingCost: field(billing, 'MonthlyChargesMagicContainers'), balance: field(billing, 'Balance'), live })
    if (verdict.undeploy) await api(o.fetch, o.key, 'POST', `/mc/apps/${o.appId}/undeploy`)
    o.log({ event: 'guard.checked', status, cost: verdict.cost, live, undeployed: verdict.undeploy, failures: verdict.failures })
    return verdict.failures.length === 0 ? 0 : 1
  } catch (error) {
    o.log({ event: 'guard.failed', message: error instanceof Error ? error.message : String(error) })
    return 1
  }
}

if (import.meta.main) {
  const { BUNNY_API_KEY: key, MC_APP_ID: appId, SITE_URL: siteUrl } = process.env
  if (!key || !appId || !siteUrl) {
    console.log(JSON.stringify({ event: 'guard.failed', message: 'BUNNY_API_KEY, MC_APP_ID and SITE_URL are required' }))
    process.exit(1)
  }
  void runGuard({ key, appId, siteUrl, fetch, log: event => console.log(JSON.stringify(event)) }).then(code => process.exit(code))
}

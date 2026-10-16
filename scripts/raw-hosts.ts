// The panel's CDN endpoint is a bunny pull zone, and the zone answers on its own hostnames as well as on the panel's
// address: bunny's system `*.b-cdn.net` name and the endpoint's managed `*.bunny.run` name. Once the panel's address is
// linked to the endpoint, bunny reports that address as the endpoint's `publicHost`, so the hostnames that go around the
// panel's address are read from the pull zone instead (probe p2).

type Fetch = typeof fetch

/** The part of bunny's pull zone (`GET /pullzone/{id}`) read here. */
export type PullZone = { Hostnames?: { Value?: string | null }[] | null }

/** Every hostname of the pull zone but the panel's own, in bunny's order. */
export function rawHostsOf(zone: PullZone, siteUrl: string): string[] {
  const own = new URL(siteUrl).hostname

  return (zone.Hostnames ?? []).map(hostname => hostname.Value ?? '').filter(value => value !== '' && value.toLowerCase() !== own)
}

/** The CDN endpoint's pull zone from bunny's API and its hostnames but the panel's; none when no endpoint has a zone. */
export async function fetchRawHosts(o: { key: string; appId: string; siteUrl: string; fetch: Fetch }): Promise<string[]> {
  const get = async (path: string, label: string): Promise<unknown> => {
    const res = await o.fetch(`https://api.bunny.net${path}`, { headers: { AccessKey: o.key, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })

    if (!res.ok) {
      throw new Error(`bunny GET ${label}: HTTP ${res.status}`)
    }

    return res.json()
  }

  const { items } = (await get(`/mc/apps/${o.appId}/endpoints`, '/mc/apps/{id}/endpoints')) as { items?: { type?: string; pullZoneId?: string | number | null }[] }
  const zoneId = items?.find(item => item.type === 'cdn')?.pullZoneId

  if (zoneId === undefined || zoneId === null || zoneId === '') {
    return []
  }

  return rawHostsOf((await get(`/pullzone/${zoneId}`, '/pullzone/{id}')) as PullZone, o.siteUrl)
}

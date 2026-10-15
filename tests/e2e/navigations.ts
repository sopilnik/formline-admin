import type { Page } from '@playwright/test'

/** Collects the page-data requests that navigations to `path` make from now on; prefetches are left out. */
export function navigationsTo(page: Page, path: string): string[] {
  const seen: string[] = []

  page.on('request', request => {
    const url = new URL(request.url())

    if (url.pathname === path && url.searchParams.has('_rsc') && !request.headers()['next-router-prefetch']) seen.push(url.href)
  })

  return seen
}

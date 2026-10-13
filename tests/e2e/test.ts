import { test as base, expect } from '@playwright/test'
import { databaseNow, deleteSandboxesSince } from './db.ts'

/**
 * Every test fails on any Content Security Policy violation of its pages, and every sandbox made while it
 * ran, by a fixture or through the demo button, is deleted after it, so a whole run stays under the cap of 100 live
 * sandboxes.
 */
export const test = base.extend<{ cspGuard: void; sandboxes: void }>({
  cspGuard: [async ({ page }, use) => {
    const violations: string[] = []
    await page.exposeBinding('reportCspViolation', (_source, text: string) => {
      violations.push(text)
    })
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', event => {
        const report = (window as unknown as { reportCspViolation: (text: string) => Promise<void> }).reportCspViolation
        void report(`${event.violatedDirective} ${event.blockedURI}`)
      })
    })
    await use()
    expect(violations).toEqual([])
  }, { auto: true }],
  sandboxes: [async ({}, use) => {
    const since = await databaseNow()
    await use()
    await deleteSandboxesSince(since)
  }, { auto: true }],
})

export { expect }

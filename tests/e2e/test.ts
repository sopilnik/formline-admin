import { test as base, expect } from '@playwright/test'
import { createdSandboxes, deleteSandboxes } from './db'

/**
 * Every test fails on any Content Security Policy violation of its pages (spec §12.3), and the sandboxes a test
 * signed into are deleted after it, so a whole run stays under the cap of 100 live sandboxes.
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
    const first = createdSandboxes.length
    await use()
    await deleteSandboxes(createdSandboxes.splice(first))
  }, { auto: true }],
})

export { expect }

import { test as base, expect } from '@playwright/test'

/** Every test fails on any Content Security Policy violation of its pages (spec §12.3). */
export const test = base.extend<{ cspGuard: void }>({
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
})

export { expect }

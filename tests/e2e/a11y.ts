import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect } from './test'

/** axe with the WCAG 2.2 A and AA rules; serious and critical findings fail the test (spec §1). */
export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  // A transition in progress is blended with what lies behind it: axe once read the opening drawer's
  // text against the page under it. Finite animations finish first; an infinite one is left running.
  await page.evaluate(() => Promise.all(
    document.getAnimations()
      .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => undefined)),
  ))
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const serious = violations
    .filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)
  expect(serious).toEqual([])
}

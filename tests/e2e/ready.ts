import type { Locator, Page } from '@playwright/test'
import { expect } from './test.ts'

/**
 * Waits until the panel's frame has hydrated (`<html data-hydrated>`, set by FrameReady). The palette and the shortcuts
 * attach their keyboard handlers in effects, and a hydrating page can take the focus back: a key pressed or a focus
 * moved before the mark is lost.
 */
export async function frameHydrated(page: Page): Promise<void> {
  await expect(page.locator('html[data-hydrated]')).toBeAttached()
}

/** Opens a page of the panel for a test whose next step presses a key or moves the focus. */
export async function openFramed(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await frameHydrated(page)
}

/**
 * Waits until React has hydrated a server-rendered element. A page that streams in parts hydrates them after the frame, and
 * a field filled before its own part hydrates loses the fill's selection: the typed text lands in front of the old value.
 */
export async function hydrated(target: Locator): Promise<void> {
  await expect.poll(() => target.evaluate(element => Object.keys(element).some(key => key.startsWith('__reactFiber')))).toBe(true)
}

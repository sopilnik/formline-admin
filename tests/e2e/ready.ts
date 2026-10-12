import type { Page } from '@playwright/test'
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

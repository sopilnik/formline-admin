import type { Page } from '@playwright/test'
import { expect, test } from './test.ts'

const IMAGE_PATH = '/opengraph-image.png'

function metaContent(page: Page, attribute: string) {
  return page.locator(`head meta[${attribute}]`).getAttribute('content')
}

// The card a link to the panel unfolds into in a chat or on a profile page: a title, a line and a picture.
test.describe('link preview', () => {
  test('every page names the card with absolute addresses', async ({ page, baseURL }) => {
    await page.goto('/sign-in')

    const description = await metaContent(page, 'name="description"')
    const image = new URL((await metaContent(page, 'property="og:image"'))!)

    expect(await metaContent(page, 'property="og:title"')).toBe('Formline Admin')
    expect(description).toMatch(/^The panel is where orders are processed/)
    expect(await metaContent(page, 'property="og:description"')).toBe(description)
    expect(await metaContent(page, 'property="og:url"')).toBe(baseURL)
    expect(image.origin).toBe(baseURL)
    expect(image.pathname).toBe(IMAGE_PATH)
    expect(await metaContent(page, 'property="og:image:width"')).toBe('1200')
    expect(await metaContent(page, 'property="og:image:height"')).toBe('630')
    expect(await metaContent(page, 'name="twitter:card"')).toBe('summary_large_image')
  })

  test('the image is served for other sites to show, and the pages stay their own', async ({ request }) => {
    const image = await request.get(IMAGE_PATH)
    const signIn = await request.get('/sign-in')

    expect(image.status()).toBe(200)
    expect(image.headers()['content-type']).toBe('image/png')
    expect(image.headers()['cross-origin-resource-policy']).toBe('cross-origin')
    expect(signIn.headers()['cross-origin-resource-policy']).toBe('same-origin')
  })
})

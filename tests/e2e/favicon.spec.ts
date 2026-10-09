import { expect, test } from './test'

// The panel's own mark in the tab (W.4): the orange F on a tile of the sidebar's colour, as SVG and as a 16 + 32 px ICO.
test.describe('favicon', () => {
  test('every page names both icons, and both are served', async ({ page, request }) => {
    await page.goto('/sign-in')
    const links = await page.locator('head link[rel="icon"]').evaluateAll(found => found.map(link => link.getAttribute('href') ?? ''))
    expect(links).toHaveLength(2)

    const ico = links.find(href => href.startsWith('/favicon.ico'))!
    const icoResponse = await request.get(ico)
    expect(icoResponse.status()).toBe(200)
    expect(icoResponse.headers()['content-type']).toBe('image/x-icon')
    expect((await icoResponse.body()).length).toBe(906)

    const svg = links.find(href => href.startsWith('/icon.svg'))!
    const svgResponse = await request.get(svg)
    expect(svgResponse.status()).toBe(200)
    expect(svgResponse.headers()['content-type']).toBe('image/svg+xml')
    expect(await svgResponse.text()).toContain('fill="#F07A4F"')
  })
})

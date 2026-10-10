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
    expect((await icoResponse.body()).length).toBe(795)

    const svg = links.find(href => href.startsWith('/icon.svg'))!
    const svgResponse = await request.get(svg)
    expect(svgResponse.status()).toBe(200)
    expect(svgResponse.headers()['content-type']).toBe('image/svg+xml')
    expect(await svgResponse.text()).toContain('fill="#F07A4F"')
  })

  test('the F sits on whole pixels at 16 and 32 px', async ({ request }) => {
    const svg = await (await request.get('/icon.svg')).text()
    const path = /<path d="([^"]+)"/.exec(svg)![1]!
    const numbers = path.match(/\d+(\.\d+)?/g)!.map(Number)
    // The viewBox is 64 wide: a coordinate that divides by 4 falls on a pixel edge at 16 px, and so at 32 px too.
    expect(numbers.filter(n => n % 4 !== 0)).toEqual([])
  })
})

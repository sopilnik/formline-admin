import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type Pair = { light: string; dark: string }

const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')

function readTokens(): Map<string, Pair> {
  const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  const tokens = new Map<string, Pair>()
  for (const m of root.matchAll(/--([\w-]+):\s*light-dark\((#[0-9A-Fa-f]{6}),\s*(#[0-9A-Fa-f]{6})\);/g)) {
    tokens.set(m[1]!, { light: m[2]!, dark: m[3]! })
  }
  for (const m of root.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6});/g)) tokens.set(m[1]!, { light: m[2]!, dark: m[2]! })
  // The sidebar surface is the one fixed token that follows the page theme.
  const darkSidebar = /:root\.dark\s*\{\s*--sidebar:\s*(#[0-9A-Fa-f]{6});/.exec(css)?.[1]
  const sidebar = tokens.get('sidebar')
  if (sidebar && darkSidebar) tokens.set('sidebar', { light: sidebar.light, dark: darkSidebar })
  return tokens
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const tokens = readTokens()

function expectContrast(fg: string, bg: string, min: number): void {
  const f = tokens.get(fg)
  const b = tokens.get(bg)
  expect(f, fg).toBeDefined()
  expect(b, bg).toBeDefined()
  for (const theme of ['light', 'dark'] as const) {
    const ratio = contrast(f![theme], b![theme])
    expect(ratio, `${fg} on ${bg} (${theme}) is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min)
  }
}

const TEXT = ['foreground', 'ink-2', 'muted-foreground']
const SURFACES = ['background', 'card', 'secondary', 'row-selected', 'primary-soft']

describe('token contrast (WCAG 2.2 AA)', () => {
  it.each(TEXT.flatMap(fg => SURFACES.map(bg => [fg, bg] as const)))('text %s on %s reaches 4.5:1', (fg, bg) => {
    expectContrast(fg, bg, 4.5)
  })

  it.each([
    ['primary', 'background'], ['primary', 'card'], ['primary', 'secondary'], ['destructive', 'card'],
    ['destructive', 'background'], ['primary-foreground', 'primary'], ['primary-foreground', 'primary-hover'], ['selected-foreground', 'selected'],
    ['status-info', 'badge-paid'], ['status-warn', 'badge-processing'], ['status-violet', 'badge-shipped'],
    ['status-ok', 'badge-delivered'], ['status-gray', 'badge-cancelled'], ['status-bad', 'badge-refunded'],
    ['sidebar-foreground', 'sidebar'], ['sidebar-muted', 'sidebar'], ['sidebar-strong', 'sidebar'],
    ['sidebar-foreground', 'sidebar-accent'], ['sidebar-bar-foreground', 'sidebar-bar'],
  ] as const)('text %s on %s reaches 4.5:1', (fg, bg) => {
    expectContrast(fg, bg, 4.5)
  })

  it.each([
    ['input', 'background'], ['input', 'card'], ['ring', 'background'], ['ring', 'card'], ['chart-ink', 'card'],
    ['collection-mono', 'card'], ['collection-primary', 'card'], ['collection-pastel', 'card'],
    ['collection-night', 'card'], ['sidebar-bar', 'sidebar'],
  ] as const)('boundary or data color %s against %s reaches 3:1', (fg, bg) => {
    expectContrast(fg, bg, 3)
  })
})

import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dir = new URL('../../src/components/ui/', import.meta.url)
const files = readdirSync(dir).filter(name => name.endsWith('.tsx'))
const read = (name: string): string => readFileSync(new URL(name, dir), 'utf8')
const classStrings = (source: string): string[] => [...source.matchAll(/"([^"\n]*)"/g)].map(m => m[1]!)

describe('vendored ui primitives', () => {
  it('include every primitive the panel uses', () => {
    expect(files).toEqual(expect.arrayContaining([
      'button.tsx', 'checkbox.tsx', 'dialog.tsx', 'dropdown-menu.tsx', 'input.tsx', 'label.tsx', 'sheet.tsx', 'skeleton.tsx',
      'toast.tsx', 'toggle-group.tsx', 'toggle.tsx', 'tooltip.tsx',
    ]))
  })

  it.each(files)('%s has no translucent focus halo', name => {
    expect(read(name)).not.toMatch(/ring-ring\/50|outline-ring\/50|focus-visible:ring-/)
  })

  it.each(files)('%s pairs every focus style with the solid outline', name => {
    for (const value of classStrings(read(name))) {
      if (/\bfocus(-visible)?:/.test(value)) expect(value).toMatch(/focus-visible:outline-ring/)
    }
  })

  it.each(files)('%s marks checked controls with the selected token, not primary', name => {
    expect(read(name)).not.toMatch(/data-checked:(bg|border)-primary/)
  })

  it('hovers the default button with its own solid colour, never a see-through primary', () => {
    expect(read('button.tsx')).toContain('hover:bg-primary-hover')
    expect(read('button.tsx')).not.toMatch(/bg-primary\/\d/)
  })

  it('keeps the checkbox off the primary colour', () => {
    expect(read('checkbox.tsx')).not.toMatch(/primary/)
  })

  it.each(files)('%s takes cn from @/lib/utils', name => {
    expect(read(name)).not.toMatch(/from "cn"/)
  })

  it('uses Base UI toasts, not sonner', () => {
    expect(files).not.toContain('sonner.tsx')
    expect(read('toast.tsx')).toContain('@base-ui/react/toast')
  })
})

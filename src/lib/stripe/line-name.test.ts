import { describe, expect, it } from 'vitest'
import { parseLineName } from '@/lib/stripe/line-name'

describe('parseLineName', () => {
  it('reads the store\'s line name as a SKU of the catalog snapshot', () => {
    expect(parseLineName('Far Orbit · A2 · Ink')).toEqual({ sku: 'far-orbit-a2-ink', size: 'a2', palette: 'ink' })
    expect(parseLineName('Ninety-Six · A1 · Paper')).toEqual({ sku: 'ninety-six-a1-paper', size: 'a1', palette: 'paper' })
  })

  it('refuses a name the store does not write', () => {
    expect(parseLineName('Far Orbit · A2')).toBeNull()
    expect(parseLineName('Far Orbit · A2 · Ink · Framed')).toBeNull()
    expect(parseLineName('Far Orbit - A2 - Ink')).toBeNull()
    expect(parseLineName('Gift card · A2 · Ink')).toBeNull()
    expect(parseLineName('Far Orbit · A0 · Ink')).toBeNull()
    expect(parseLineName('far orbit · A2 · Ink')).toBeNull()
  })

  it('refuses a palette the poster is not printed in', () => {
    expect(parseLineName('Far Orbit · A2 · Sage')).toBeNull()
  })
})

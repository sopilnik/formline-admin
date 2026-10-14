import { describe, expect, it } from 'vitest'
import { buildChart, niceStep, scaleTop, tickIndexes } from '@/lib/overview/chart'
import { periodPlan } from '@/lib/periods'

const berlin = 'Europe/Berlin'
const now = new Date('2026-09-27T09:00:00Z')

describe('the scale', () => {
  it('picks the smallest round step that reaches the value', () => {
    expect(niceStep(27067)).toBe(30000)
    expect(niceStep(20000)).toBe(20000)
    expect(niceStep(20001)).toBe(25000)
    expect(niceStep(50001)).toBe(60000)
    expect(niceStep(32700)).toBe(40000)
    expect(niceStep(0)).toBe(1000)
    expect(scaleTop([81200, 64000, null])).toBe(90000)
    expect(scaleTop([])).toBe(3000)
  })
})

describe('tickIndexes', () => {
  it('labels every day on 7 days and every week, ending on today, on 30 days and this month', () => {
    expect(tickIndexes(periodPlan('7d', now, berlin)).map(t => t.index)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(tickIndexes(periodPlan('30d', now, berlin)).map(t => t.index)).toEqual([1, 8, 15, 22, 29])
    expect(tickIndexes(periodPlan('month', now, berlin)).map(t => t.index)).toEqual([5, 12, 19, 26])
  })

  it('labels every week on 90 days, and marks every other label back from today for narrow charts', () => {
    const ticks = tickIndexes(periodPlan('90d', now, berlin))
    expect(ticks).toHaveLength(13)
    expect(ticks.filter(t => t.alternate).map(t => t.index)).toEqual([1, 3, 5, 7, 9, 11])
    expect(tickIndexes(periodPlan('30d', now, berlin)).filter(t => t.alternate).map(t => t.index)).toEqual([8, 22])
    expect(tickIndexes(periodPlan('7d', now, berlin)).filter(t => t.alternate).map(t => t.index)).toEqual([1, 3, 5])
  })
})

describe('buildChart', () => {
  it('labels days, marks today and scales to the largest value of both periods', () => {
    const plan = periodPlan('7d', now, berlin)
    const model = buildChart({ plan, current: [100, 20000, 0, 50000, 0, 0, 81200], previous: [0, 0, 0, 0, 0, 0, 90000], locale: 'en', timeZone: berlin })
    expect(model.max).toBe(90000)
    expect(model.grid.map(g => g.label)).toEqual(['$0', '$300', '$600', '$900'])
    expect(model.bars.at(-1)).toMatchObject({ value: 81200, previous: 90000, amount: '$812', previousAmount: '$900', today: true })
    expect(model.bars[0]!.today).toBe(false)
    expect(model.bars[0]!.label).toMatch(/^21 Sept?$/)
    expect(model.bars.at(-1)!.previousLabel).toMatch(/^20 Sept?$/)
    expect(model.ticks.map(t => t.label).at(-1)).toMatch(/^27 Sept?$/)
  })

  it('names weeks by their range, ends the ticks on today and keeps a floor under an empty scale', () => {
    const plan = periodPlan('90d', now, berlin)
    const zeros = plan.buckets.map(() => 0)
    const model = buildChart({ plan, current: zeros, previous: zeros, locale: 'en', timeZone: berlin })
    expect(model.bars.at(-1)!.label).toMatch(/^21[\u2009 ]–[\u2009 ]27\u00a0Sept?$/)
    expect(model.ticks.at(-1)!.label).toMatch(/^27 Sept?$/)
    expect(model.max).toBe(3000)
  })

  it('leaves the previous value out where the previous month has no such day', () => {
    const plan = periodPlan('month', new Date('2026-03-30T10:00:00Z'), berlin)
    const model = buildChart({ plan, current: plan.buckets.map(() => 100), previous: plan.previousBuckets.map(b => (b ? 100 : null)), locale: 'ru', timeZone: berlin })
    expect(model.bars[29]).toMatchObject({ previous: null, previousLabel: null, previousAmount: null })
    expect(model.bars[0]!.label).toBe('1 мар.')
  })
})

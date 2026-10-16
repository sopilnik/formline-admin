import { describe, expect, it } from 'vitest'
import { between, createRandom, pick, weighted } from './random.ts'

describe('createRandom', () => {
  it('is deterministic for a seed and stays in [0, 1)', () => {
    const a = createRandom(42)
    const b = createRandom(42)
    const first = Array.from({ length: 1000 }, () => a())

    expect(Array.from({ length: 1000 }, () => b())).toEqual(first)
    expect(first.every(x => x >= 0 && x < 1)).toBe(true)
    expect(createRandom(43)()).not.toBe(first[0])
  })
})

describe('helpers', () => {
  it('between covers both ends and pick every item', () => {
    const random = createRandom(7)
    const seen = new Set<number>()

    for (let i = 0; i < 500; i++) {
      seen.add(between(random, 1, 3))
    }

    expect([...seen].sort()).toEqual([1, 2, 3])

    const picked = new Set<string>()

    for (let i = 0; i < 200; i++) {
      picked.add(pick(random, ['a', 'b', 'c']))
    }

    expect(picked.size).toBe(3)
  })

  it('weighted follows the weights', () => {
    const random = createRandom(11)
    let heavy = 0

    for (let i = 0; i < 2000; i++) {
      if (weighted(random, [['heavy', 9], ['light', 1]]) === 'heavy') {
        heavy++
      }
    }

    expect(heavy).toBeGreaterThan(1700)
    expect(heavy).toBeLessThan(1950)
  })
})

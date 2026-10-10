import { describe, expect, it } from 'vitest'
// The dictionaries live outside src; the test reads every string of them.
// eslint-disable-next-line no-restricted-imports
import en from '../../messages/en.json'

type Tree = { [key: string]: string | Tree }

/** Every string of a dictionary with its dotted key. */
function strings(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value] as [string, string]] : strings(value, `${prefix}${key}.`))
}

describe('English copy', () => {
  it('uses US spelling', () => {
    const british = /recognis|organis|authoris|customis|summaris|colour|behaviour|favourite|\bcentre|catalogue|licence/i
    expect(strings(en).filter(([, text]) => british.test(text))).toEqual([])
  })

  it('names the second factor one way', () => {
    expect(strings(en).filter(([, text]) => /two-factor/i.test(text))).toEqual([])
  })
})

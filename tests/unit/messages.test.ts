import { describe, expect, it } from 'vitest'
import en from '../../messages/en.json'
import ru from '../../messages/ru.json'

type Tree = { [key: string]: string | Tree }

function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]): [string, string][] =>
    typeof value === 'string' ? [[`${prefix}${key}`, value]] : leaves(value, `${prefix}${key}.`))
}

// A true argument name is followed by "," (a formatted argument) or "}" (a bare
// placeholder); a plural or select sub-message's literal text can itself start
// with a word ("after # hour") and must not be mistaken for one.
const argumentNames = (text: string): string[] => [...new Set([...text.matchAll(/\{(\w+)(?=[,}])/g)].map(m => m[1]!))].sort()

const english = new Map(leaves(en as Tree))
const russian = new Map(leaves(ru as Tree))

describe('messages', () => {
  it('have the same keys in English and Russian', () => {
    expect([...russian.keys()].sort()).toEqual([...english.keys()].sort())
  })

  it('have no empty strings', () => {
    for (const [key, value] of [...english, ...russian]) expect(value.trim(), key).not.toBe('')
  })

  it('use the same arguments in both languages', () => {
    for (const [key, value] of english) expect(argumentNames(russian.get(key) ?? ''), key).toEqual(argumentNames(value))
  })

  it('put a given name in quotes inside a Russian sentence', () => {
    // A name cannot be declined, so it stands in quotes; a label that ends in the value and a person's name need none.
    const bare = new Set(['theme.label', 'language.label', 'user.menu'])
    for (const [key, value] of russian) {
      if (value.includes('{name}') && !bare.has(key)) expect(value, key).toContain('«{name}»')
    }
  })
})

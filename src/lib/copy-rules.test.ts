import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
// The dictionaries live outside src; the test reads every string of them.
// eslint-disable-next-line no-restricted-imports
import en from '../../messages/en.json'
// eslint-disable-next-line no-restricted-imports
import ru from '../../messages/ru.json'

type Tree = { [key: string]: string | Tree }

/** Every string of a dictionary with its dotted key. */
function strings(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value] as [string, string]] : strings(value, `${prefix}${key}.`))
}

/** A plural or select block as one token, so the words of its branches are not counted once per branch. */
function flatten(text: string): string {
  let out = text
  for (let before = ''; before !== out;) {
    before = out
    out = out.replace(/\{[^{}]*,\s*(plural|select|selectordinal),[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '#')
  }
  return out
}

/** Every sentence of every Russian string, with its key. */
const russianSentences = strings(ru).flatMap(([key, text]) =>
  flatten(text).split(/(?<=[.!?])\s+/).filter(sentence => sentence.trim() !== '').map(sentence => [key, sentence] as const))

/** The sentences that break a rule, as "key: sentence". */
const breaking = (rule: (sentence: string) => boolean) =>
  russianSentences.filter(([, sentence]) => rule(sentence)).map(([key, sentence]) => `${key}: ${sentence}`)

describe('English copy', () => {
  it('uses US spelling', () => {
    const british = /recognis|organis|authoris|customis|summaris|colour|behaviour|favourite|\bcentre|catalogue|licence/i
    expect(strings(en).filter(([, text]) => british.test(text))).toEqual([])
  })

  it('names the second factor one way', () => {
    expect(strings(en).filter(([, text]) => /two-factor/i.test(text))).toEqual([])
  })
})

describe('Russian copy (the owner’s rules)', () => {
  it('has at most one «и», «или» or «либо» in a sentence', () => {
    const conjunctions = (sentence: string) => sentence.match(/(?<![\p{L}-])(и|или|либо)(?![\p{L}-])/giu)?.length ?? 0
    expect(breaking(sentence => conjunctions(sentence) > 1)).toEqual([])
  })

  it('has at most one dash in a sentence and never a colon followed by a dash', () => {
    expect(breaking(sentence => (sentence.match(/ [—–] /g)?.length ?? 0) > 1 || /:[^.!?]*[—–]/.test(sentence))).toEqual([])
  })

  it('chains no clauses with a semicolon', () => {
    expect(strings(ru).filter(([, text]) => text.includes(';'))).toEqual([])
  })

  it('names the email «Email» and the workspace «рабочее пространство»', () => {
    expect(strings(ru).filter(([, text]) => /почт/i.test(text))).toEqual([])
    expect(strings(ru).filter(([, text]) => /(?<!рабоч\p{L}* )пространств/iu.test(text))).toEqual([])
  })

  it('keeps a dollar amount with its sign', () => {
    expect(strings(ru).filter(([, text]) => /\d \$/.test(text))).toEqual([])
  })

  it('uses the plural for every count of skipped orders above one', () => {
    const t = createTranslator({ locale: 'ru', messages: ru, namespace: 'orders.bulk' })
    expect(t('skipped', { count: 21, numbers: '#1408' })).toMatch(/^Пропущены /)
    expect(t('skipped', { count: 1, numbers: '#1408' })).toMatch(/^Пропущен /)
  })
})

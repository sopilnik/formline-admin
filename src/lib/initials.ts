const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** The first letter of a word as a reader sees it: a whole grapheme (an accent stays on its letter), emoji and marks skipped. */
function firstLetter(word: string): string | undefined {
  for (const { segment } of graphemes.segment(word)) if (/\p{L}/u.test(segment)) return segment
  return undefined
}

/** The avatar's letters: the first letter of the name's first two words that have one, or its first character. */
export function initials(name: string): string {
  const letters = name.split(/\s+/).map(firstLetter).filter(letter => letter !== undefined).slice(0, 2)
  if (letters.length > 0) return letters.map(letter => letter.toLocaleUpperCase()).join('')
  return graphemes.segment(name.trim())[Symbol.iterator]().next().value?.segment ?? ''
}

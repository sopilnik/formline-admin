/** A LIKE pattern that finds `text` anywhere in a value: its own `%`, `_` and `\` match literally. */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, match => `\\${match}`)}%`
}

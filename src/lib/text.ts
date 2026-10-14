// Whitespace and the invisible format characters (Unicode Cf: zero-width spaces and joiners, direction marks) at either end.
const EDGES = /^[\s\p{Cf}]+|[\s\p{Cf}]+$/gu

/**
 * A one-line value as the panel keeps it: the whitespace and the format characters at either end dropped, so a name made
 * only of zero-width spaces reads as empty. Those inside stay: a zero-width joiner holds an emoji or a word together.
 */
export function cleanLine(value: string): string {
  return value.replace(EDGES, '')
}

/**
 * A text area's value as the panel keeps it: each line break as one LF, the way the field counts it while a browser sends
 * CR LF, and the ends cleaned as a line's.
 */
export function cleanText(value: string): string {
  return cleanLine(value.replace(/\r\n?/g, '\n'))
}

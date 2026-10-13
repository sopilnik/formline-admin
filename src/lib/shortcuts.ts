// The keyboard shortcuts. Every one of them is a single character, so the profile can turn them all off
// (WCAG 2.2 SC 2.1.4); ⌘K / Ctrl+K belongs to the command palette and stays on.

/** "g" then one of these letters goes to the page. */
export const GO_KEYS = { h: 'overview', o: 'orders', p: 'products', c: 'customers' } as const
export type GoPage = (typeof GO_KEYS)[keyof typeof GO_KEYS]

/** How long "g" waits for its second key. */
export const SEQUENCE_MS = 1000

export type Shortcut = { type: 'go'; page: GoPage } | { type: 'search' } | { type: 'help' }

/** One key press: the character, the physical key, the modifiers, whether it lands in a field, and when. */
export type KeyInput = { key: string; code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; typing: boolean; time: number }

/** Whether a key lands in something the user types into; shortcuts then stay out of the way. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="combobox"], [role="textbox"]') !== null
}

/**
 * The Latin letter of a key press. A Cyrillic layout types "п" on the key of "g", so a key that is no Latin letter is
 * read by its place on the keyboard; the letters then work in either layout.
 */
function letterOf(input: KeyInput): string | null {
  if (/^[a-z]$/.test(input.key)) return input.key
  if (/^[A-Za-z]$/.test(input.key)) return null
  const place = /^Key([A-Z])$/.exec(input.code)
  return place ? place[1]!.toLowerCase() : null
}

/**
 * Reads key presses one at a time and names the shortcut they complete. It remembers a pending "g" between presses,
 * so a page keeps one reader.
 */
export function createShortcutReader(): (input: KeyInput) => Shortcut | null {
  let pendingSince: number | null = null
  return input => {
    const pending = pendingSince !== null && input.time - pendingSince <= SEQUENCE_MS
    pendingSince = null
    if (input.typing || input.ctrlKey || input.metaKey || input.altKey) return null
    const letter = letterOf(input)
    if (pending && letter !== null && letter in GO_KEYS) return { type: 'go', page: GO_KEYS[letter as keyof typeof GO_KEYS] }
    if (letter === 'g') {
      pendingSince = input.time
      return null
    }
    if (input.key === '/') return { type: 'search' }
    if (input.key === '?') return { type: 'help' }
    return null
  }
}

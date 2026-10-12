// What the lists' filters share apart from their markup: the rule of the "all" chip and the search form's hidden fields.

/** The value of the "all" chip, which no status takes. */
export const ALL = 'all'

/** "All" is on only while no status is; pressing it clears them, releasing the last status turns it back on. */
export function statusesFrom<S extends string>(statuses: readonly S[], next: readonly string[], previous: readonly S[]): S[] {
  if (next.includes(ALL) && previous.length > 0) return []
  return statuses.filter(status => next.includes(status))
}

/** A list URL's parameters as hidden fields, so the list's search form also works without scripts. */
export function hiddenFields(href: string): [string, string][] {
  const at = href.indexOf('?')
  return at === -1 ? [] : [...new URLSearchParams(href.slice(at + 1))]
}

// What a list page reads from its URL: one shape for Next.js's searchParams and one set of readers for every list.
import { SEARCH_MAX } from '@/lib/search'

/** A page's searchParams as Next.js passes them. */
export type SearchParams = Record<string, string | string[] | undefined>

/** Every value of a key, from a page's params or from a URL. */
export function all(params: SearchParams | URLSearchParams, key: string): string[] {
  if (params instanceof URLSearchParams) return params.getAll(key)

  const value = params[key]

  return value === undefined ? [] : Array.isArray(value) ? value : [value]
}

/** The first value of a key. */
export const one = (params: SearchParams | URLSearchParams, key: string): string | undefined => all(params, key)[0]

/** The value when it is one of the options, else the fallback: an unknown value never becomes an error. */
export function pick<T extends string>(options: readonly T[], value: string | undefined, fallback: T): T {
  return value !== undefined && (options as readonly string[]).includes(value) ? (value as T) : fallback
}

/** A list's search box as the URL carries it: trimmed and no longer than the longest search. */
export function searchText(params: SearchParams | URLSearchParams, key = 'q'): string {
  return (one(params, key) ?? '').trim().slice(0, SEARCH_MAX)
}

import { describe, expect, it } from 'vitest'
import { all, one, pick, searchText } from '@/lib/search-params'
import { SEARCH_MAX } from '@/lib/search'

describe('search params', () => {
  it('read every value and the first one, from a page\'s params and from a URL alike', () => {
    expect(all({ status: ['new', 'paid'] }, 'status')).toEqual(['new', 'paid'])
    expect(all({ status: 'new' }, 'status')).toEqual(['new'])
    expect(all({}, 'status')).toEqual([])
    expect(all(new URLSearchParams('status=new&status=paid'), 'status')).toEqual(['new', 'paid'])
    expect(one({ page: ['3', '4'] }, 'page')).toBe('3')
    expect(one(new URLSearchParams('page=3&page=4'), 'page')).toBe('3')
    expect(one({}, 'page')).toBeUndefined()
  })

  it('pick a value only when it is one of the options', () => {
    expect(pick(['asc', 'desc'] as const, 'desc', 'asc')).toBe('desc')
    expect(pick(['asc', 'desc'] as const, 'up', 'asc')).toBe('asc')
    expect(pick(['asc', 'desc'] as const, undefined, 'asc')).toBe('asc')
  })

  it('keep a search trimmed and no longer than the longest search', () => {
    expect(searchText({ q: '  rose  ' })).toBe('rose')
    expect(searchText({})).toBe('')
    expect(searchText(new URLSearchParams(`q=${'a'.repeat(SEARCH_MAX + 5)}`))).toHaveLength(SEARCH_MAX)
  })
})

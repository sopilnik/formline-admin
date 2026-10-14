import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_QUERY, DEFAULT_PAGE_SIZE, pageCount, pageQueryHref, pageRange, pageWindow, parsePage, parsePageQuery, parsePageSize } from '@/lib/pagination'

describe('parsePage and parsePageSize', () => {
  it('read a whole page number from 1 and one of the offered sizes', () => {
    expect(parsePage('3')).toBe(3)
    expect(parsePageSize('50')).toBe(50)
    expect(parsePageSize('100')).toBe(100)
  })

  it('fall back to the first page and the default size', () => {
    for (const value of [undefined, '', '0', '-2', '1.5', 'abc']) expect(parsePage(value), String(value)).toBe(1)
    for (const value of [undefined, '', '7', '1000', '25.0x']) expect(parsePageSize(value), String(value)).toBe(DEFAULT_PAGE_SIZE)
    expect(DEFAULT_PAGE_SIZE).toBe(25)
  })
})

describe('pageRange', () => {
  it('gives the first and the last row of a page, the last page cut at the end of the rows', () => {
    expect(pageRange(1, 25, 47)).toEqual({ from: 1, to: 25 })
    expect(pageRange(2, 25, 47)).toEqual({ from: 26, to: 47 })
  })
})

describe('pageCount', () => {
  it('counts the pages the rows fill, at least one', () => {
    expect(pageCount(0, 25)).toBe(1)
    expect(pageCount(25, 25)).toBe(1)
    expect(pageCount(26, 25)).toBe(2)
    expect(pageCount(700, 25)).toBe(28)
  })
})

describe('pageWindow', () => {
  it('shows at most five pages, the current one centred where it can be', () => {
    expect(pageWindow(1, 1)).toEqual([1])
    expect(pageWindow(1, 3)).toEqual([1, 2, 3])
    expect(pageWindow(1, 28)).toEqual([1, 2, 3, 4, 5])
    expect(pageWindow(4, 28)).toEqual([2, 3, 4, 5, 6])
    expect(pageWindow(28, 28)).toEqual([24, 25, 26, 27, 28])
  })
})

describe('the page query', () => {
  it('reads the page and its size, and falls back to the defaults', () => {
    expect(parsePageQuery({ page: '3', size: '50' })).toEqual({ page: 3, size: 50 })
    expect(parsePageQuery({ page: ['3', '4'], size: '30' })).toEqual({ page: 3, size: 25 })
    expect(parsePageQuery({ page: 'x', size: '7' })).toEqual(DEFAULT_PAGE_QUERY)
    expect(parsePageQuery({})).toEqual(DEFAULT_PAGE_QUERY)
  })

  it('leaves the defaults out of the path and starts again at page 1 when the size changes', () => {
    expect(pageQueryHref('/outbox', DEFAULT_PAGE_QUERY)).toBe('/outbox')
    expect(pageQueryHref('/outbox', { page: 3, size: 25 }, { page: 4 })).toBe('/outbox?page=4')
    expect(pageQueryHref('/notifications', { page: 3, size: 25 }, { size: 100 })).toBe('/notifications?size=100')
    expect(pageQueryHref('/notifications', { page: 2, size: 50 })).toBe('/notifications?page=2&size=50')
  })
})

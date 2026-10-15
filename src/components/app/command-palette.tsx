'use client'

import { Autocomplete } from '@base-ui/react/autocomplete'
import { Dialog } from '@base-ui/react/dialog'
import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState, useTransition } from 'react'
import type { NavItem } from '@/components/app/nav'
import { useShortcuts } from '@/components/app/shortcuts'
import { useSignOut } from '@/components/app/sign-out'
import { useIsApple } from '@/components/app/use-is-apple'
import { useReach } from '@/components/app/use-reach'
import { Button } from '@/components/ui/button'
import { LOCALES } from '@/i18n/locale'
import { customerHref } from '@/lib/customers/view'
import { formatMoney } from '@/lib/intl'
import { orderHref } from '@/lib/orders/view'
import { productHref } from '@/lib/products/view'
import { NO_RESULTS, searchTerm, type SearchResults } from '@/lib/search'
import { THEMES } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { setLocaleAction, setThemeAction } from '@/server/actions/preferences'

/** What the palette may offer beyond the pages: the actions the member's role allows. */
type PaletteAccess = { newProduct: boolean; invite: boolean }

/** One choice of the palette; `field` names the first field of a form it opens, which takes the focus once it is there. */
type Entry = { value: string; label: string; hint?: string; field?: string; run: () => void }

/** Puts the focus in a field once the page that holds it has arrived; gives up after a few seconds. */
function focusOnArrival(id: string): void {
  const started = performance.now()
  const look = (): void => {
    const field = document.getElementById(id)

    if (field) {
      field.focus()
    } else if (performance.now() - started < 5000) {
      requestAnimationFrame(look)
    }
  }

  requestAnimationFrame(look)
}

type Group = { value: 'pages' | 'actions' | 'orders' | 'customers' | 'products'; items: Entry[] }

/** The pause after the last keystroke before the palette asks the server. */
const DEBOUNCE_MS = 200

/**
 * The command palette: ⌘K or Ctrl+K anywhere, or the search button in the top bar. It lists the pages and
 * the actions the member may use, and searches orders, customers and products on the server as they type.
 */
export function CommandPalette({ items, access }: { items: NavItem[]; access: PaletteAccess }) {
  const t = useTranslations('palette')
  const [open, setOpen] = useState(false)
  const [opened, setOpened] = useState(0)
  const apple = useIsApple()
  // A choice that opens a form puts the focus in the form's first field: the dialog then does not hand it back to the
  // search button.
  const toForm = useRef(false)

  const openChange = (next: boolean) => {
    setOpen(next)

    if (next) {
      toForm.current = false
      setOpened(count => count + 1)
    }
  }

  // ⌘K is no single-character shortcut, so it stays on even when the profile turns shortcuts off (WCAG 2.1.4).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey)) {
        return
      }
      // An open dialog or sheet has the keyboard to itself: the palette would stack on it, and it would stay open behind.
      if (event.target instanceof Element && event.target.closest('[data-slot="dialog-content"], [data-slot="sheet-content"]')) {
        return
      }

      event.preventDefault()
      toForm.current = false
      setOpened(count => count + 1)
      setOpen(current => !current)
    }

    document.addEventListener('keydown', onKey)

    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Dialog.Root open={open} onOpenChange={openChange}>
      <Dialog.Trigger
        render={<Button variant="outline" className="justify-start gap-2 px-2.5 text-muted-foreground lg:w-56" aria-keyshortcuts={apple ? 'Meta+K' : 'Control+K'} />}
      >
        <Search aria-hidden />
        <span className="sr-only lg:not-sr-only lg:flex-1 lg:text-left">{t('open')}</span>
        <kbd aria-hidden className="hidden rounded-sm border px-1.5 font-sans text-[11px] leading-5 text-muted-foreground lg:inline">{apple ? '⌘K' : 'Ctrl K'}</kbd>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 isolate z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup
          aria-label={t('title')}
          finalFocus={() => !toForm.current}
          className="fixed top-[10dvh] left-1/2 z-50 flex max-h-[80dvh] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none"
        >
          <PaletteSearch
            key={opened}
            items={items}
            access={access}
            close={opensForm => {
              toForm.current = opensForm
              setOpen(false)
            }}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** What the palette says instead of results: still searching, the search failed, nothing found, or nothing. */
function noticeKey(searching: boolean, failed: boolean, empty: boolean): 'searching' | 'failed' | 'empty' | null {
  if (searching) {
    return 'searching'
  }

  if (failed) {
    return 'failed'
  }

  return empty ? 'empty' : null
}

/** The debounced search behind the palette: what it found for the last term, and whether it is under way or failed. */
function useLiveSearch() {
  const [found, setFound] = useState<{ term: string; results: SearchResults } | null>(null)
  const [searching, setSearching] = useState(false)
  const [failed, setFailed] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const request = useRef<AbortController | null>(null)

  useEffect(() => () => {
    window.clearTimeout(timer.current)
    request.current?.abort()
  }, [])

  const search = (next: string) => {
    window.clearTimeout(timer.current)
    request.current?.abort()

    const term = searchTerm(next)

    setFailed(false)
    setSearching(term !== null)

    if (!term) {
      return
    }

    timer.current = window.setTimeout(() => {
      const controller = new AbortController()

      request.current = controller

      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal, cache: 'no-store' })
        .then(response => (response.ok ? (response.json() as Promise<SearchResults>) : Promise.reject(new Error(String(response.status)))))
        .then(results => {
          setFound({ term, results })
          setSearching(false)
        })
        .catch(() => {
          if (controller.signal.aborted) {
            return
          }

          setSearching(false)
          setFailed(true)
        })
    }, DEBOUNCE_MS)
  }

  return { found, searching, failed, search }
}

function PaletteSearch({ items, access, close }: { items: NavItem[]; access: PaletteAccess; close: (opensForm: boolean) => void }) {
  const t = useTranslations('palette')
  const nav = useTranslations('nav')
  const orderStatus = useTranslations('orders.status')
  const productStatus = useTranslations('products.status')
  const locale = useLocale()
  const router = useRouter()
  const signOut = useSignOut()
  const shortcuts = useShortcuts()
  const [, startTransition] = useTransition()
  const send = useReach()
  const [query, setQuery] = useState('')
  const { found, searching, failed, search } = useLiveSearch()
  const { contains } = Autocomplete.useFilter()

  const change = (next: string) => {
    setQuery(next)
    search(next)
  }

  const go = (href: string) => () => router.push(href)
  const pages: Entry[] = items.map(item => ({ value: `page:${item.key}`, label: nav(item.key), run: go(item.href) }))
  const actions: Entry[] = [
    ...(access.newProduct ? [{ value: 'action:new-product', label: t('actions.newProduct'), field: 'product-name', run: go('/products/new') }] : []),
    ...(access.invite ? [{ value: 'action:invite', label: t('actions.invite'), field: 'invite-email', run: go('/team#team-invite') }] : []),
    ...THEMES.map(theme => ({
      value: `action:theme-${theme}`,
      label: t(`actions.theme.${theme}`),
      run: () => startTransition(async () => { await send(() => setThemeAction(theme)) }),
    })),
    ...LOCALES.filter(other => other !== locale).map(other => ({
      value: `action:language-${other}`,
      label: t(`actions.language.${other}`),
      run: () => startTransition(async () => { await send(() => setLocaleAction(other)) }),
    })),
    { value: 'action:shortcuts', label: t('actions.shortcuts'), run: shortcuts.showHelp },
    { value: 'action:sign-out', label: t('actions.signOut'), run: signOut.request },
  ]
  const term = searchTerm(query)
  const results = found && term === found.term ? found.results : NO_RESULTS
  const every: Group[] = [
    { value: 'pages', items: pages.filter(entry => contains(entry.label, query)) },
    { value: 'actions', items: actions.filter(entry => contains(entry.label, query)) },
    {
      value: 'orders',
      items: results.orders.map(order => ({
        value: `order:${order.number}`,
        label: t('orderLabel', { number: order.number, customer: order.customer }),
        hint: `${formatMoney(order.totalCents, locale)} · ${orderStatus(order.status)}`,
        run: go(orderHref(order.number)),
      })),
    },
    {
      value: 'customers',
      items: results.customers.map(customer => ({ value: `customer:${customer.id}`, label: customer.name, hint: customer.email, run: go(customerHref(customer.id)) })),
    },
    {
      value: 'products',
      items: results.products.map(product => ({
        value: `product:${product.slug}`,
        label: product.name,
        hint: productStatus(product.status),
        run: go(productHref(product.slug)),
      })),
    },
  ]
  const groups = every.filter(group => group.items.length > 0)

  const empty = !searching && !failed && groups.length === 0
  const notice = noticeKey(searching, failed, empty)
  const shown = notice === null ? null : t(notice, { query: query.trim() })
  // The status region says every turn of the search, what it found included, so a screen reader hears it while one types;
  // the count itself stays unseen.
  const status = shown ?? (query.trim() ? t('found', { count: groups.reduce((sum, group) => sum + group.items.length, 0) }) : null)

  return (
    <Autocomplete.Root open inline items={groups} value={query} onValueChange={change} filter={null} autoHighlight="always" keepHighlight>
      <div className="flex items-center gap-2 border-b px-4">
        <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <Autocomplete.Input
          aria-label={t('input')}
          placeholder={t('placeholder')}
          className="h-12 w-full min-w-0 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {/* The arrows move the highlight and scroll the list; the list itself takes the focus too, as a scrolling region must. */}
      <div tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring">
        <Autocomplete.Status className={cn('px-3 text-[13px] text-muted-foreground empty:hidden', empty ? 'py-6 wrap-anywhere' : 'py-2', !shown && 'sr-only')}>
          {status}
        </Autocomplete.Status>
        <Autocomplete.List>
          {(group: Group) => (
            <Autocomplete.Group key={group.value} items={group.items} className="not-last:mb-1">
              <Autocomplete.GroupLabel className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">{t(`groups.${group.value}`)}</Autocomplete.GroupLabel>
              <Autocomplete.Collection>
                {(entry: Entry) => (
                  <Autocomplete.Item
                    key={entry.value}
                    value={entry}
                    // The highlighted option is the one Enter opens: it says so as the selected option of the list.
                    render={(props, state) => <div {...props} aria-selected={state.highlighted} />}
                    onClick={() => {
                      close(entry.field !== undefined)
                      entry.run()

                      if (entry.field) {
                        focusOnArrival(entry.field)
                      }
                    }}
                    className="flex min-h-9 flex-col items-start gap-x-3 rounded-md px-3 py-1.5 text-sm outline-none select-none data-highlighted:bg-secondary data-highlighted:outline-2 data-highlighted:-outline-offset-2 data-highlighted:outline-solid data-highlighted:outline-ring sm:flex-row sm:items-center"
                  >
                    <span className="max-w-full min-w-0 flex-1 wrap-anywhere">{entry.label}</span>
                    {entry.hint ? <span className="max-w-full shrink-0 truncate text-[13px] text-muted-foreground sm:max-w-[45%]">{entry.hint}</span> : null}
                  </Autocomplete.Item>
                )}
              </Autocomplete.Collection>
            </Autocomplete.Group>
          )}
        </Autocomplete.List>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-xs text-muted-foreground">
        <span>{t('hints.move')}</span>
        <span>{t('hints.open')}</span>
        <span>{t('hints.close')}</span>
      </div>
    </Autocomplete.Root>
  )
}

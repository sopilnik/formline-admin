'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createContext, use, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { NavItem } from '@/components/app/nav'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createShortcutReader, GO_KEYS, isTypingTarget, type GoPage } from '@/lib/shortcuts'

const ShortcutsContext = createContext<{ showHelp: () => void } | null>(null)

const noSubscription = () => () => {}
const isApple = () => /Mac|iPhone|iPad/.test(navigator.platform)

/**
 * The single-key shortcuts of spec §8.10 and the list of them: "/" finds the page's search field, "g" and a letter
 * goes to a page the role may open, "?" lists them all. They never fire while the user types in a field, and the
 * profile turns them off (WCAG 2.2 SC 2.1.4); the palette can still show the list.
 */
export function ShortcutsProvider({ enabled, items, children }: { enabled: boolean; items: NavItem[]; children: ReactNode }) {
  const router = useRouter()
  const [help, setHelp] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const read = createShortcutReader()
    const onKey = (event: KeyboardEvent) => {
      // An open dialog or menu has the keyboard to itself.
      const inOverlay = event.target instanceof Element && event.target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null
      if (event.defaultPrevented || event.repeat || inOverlay) return
      const shortcut = read({
        key: event.key, code: event.code, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey,
        typing: isTypingTarget(event.target), time: event.timeStamp,
      })
      if (!shortcut) return
      if (shortcut.type === 'go') {
        const item = items.find(i => i.key === shortcut.page)
        if (!item) return
        event.preventDefault()
        router.push(item.href)
      } else if (shortcut.type === 'search') {
        const field = document.querySelector<HTMLInputElement>('main input[type="search"]')
        if (!field) return
        event.preventDefault()
        field.focus()
        field.select()
      } else {
        event.preventDefault()
        setHelp(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled, items, router])

  return (
    <ShortcutsContext value={{ showHelp: () => setHelp(true) }}>
      {children}
      <ShortcutsHelp open={help} onOpenChange={setHelp} enabled={enabled} items={items} />
    </ShortcutsContext>
  )
}

export function useShortcuts(): { showHelp: () => void } {
  const value = use(ShortcutsContext)
  if (!value) throw new Error('useShortcuts needs a ShortcutsProvider above it')
  return value
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {keys.map(key => (
        <kbd key={key} className="min-w-6 rounded-sm border border-border-strong px-1.5 text-center font-sans text-xs leading-6 text-ink-2">{key}</kbd>
      ))}
    </span>
  )
}

function ShortcutsHelp({ open, onOpenChange, enabled, items }: { open: boolean; onOpenChange: (open: boolean) => void; enabled: boolean; items: NavItem[] }) {
  const t = useTranslations('shortcuts')
  const nav = useTranslations('nav')
  const apple = useSyncExternalStore(noSubscription, isApple, () => false)
  const pages = Object.entries(GO_KEYS).filter(([, page]) => items.some(item => item.key === page)) as [string, GoPage][]
  const rows: { keys: string[]; label: string }[] = [
    { keys: [apple ? '⌘' : 'Ctrl', 'K'], label: t('palette') },
    { keys: ['/'], label: t('search') },
    ...pages.map(([letter, page]) => ({ keys: ['g', letter], label: t('goTo', { page: nav(page) }) })),
    { keys: ['?'], label: t('help') },
  ]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {enabled ? t('intro') : t.rich('off', { profile: chunks => <Link href="/settings/profile" onClick={() => onOpenChange(false)} className="font-medium text-primary underline underline-offset-3">{chunks}</Link> })}
          </DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col divide-y text-sm">
          {rows.map(row => (
            <div key={row.label} className="flex items-center justify-between gap-4 py-2">
              <dt className="min-w-0">{row.label}</dt>
              <dd><Keys keys={row.keys} /></dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}

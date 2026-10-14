'use client'

import { ChevronDown, Monitor, Moon, Sun } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { useReach } from '@/components/app/use-reach'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { THEMES, type Theme } from '@/lib/theme'
import { setThemeAction } from '@/server/actions/preferences'

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const

export function ThemeMenu({ theme }: { theme: Theme }) {
  const t = useTranslations('theme')
  const [, startTransition] = useTransition()
  const send = useReach()
  const Icon = ICONS[theme]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" aria-label={t('label', { name: t(theme) })} />}>
        <Icon aria-hidden />
        <span className="hidden lg:inline">{t(theme)}</span>
        <ChevronDown aria-hidden className="size-3.5 max-[359px]:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup value={theme} onValueChange={value => startTransition(async () => { await send(() => setThemeAction(String(value))) })}>
          {THEMES.map(value => {
            const ItemIcon = ICONS[value]
            return (
              <DropdownMenuRadioItem key={value} value={value}>
                <ItemIcon aria-hidden />
                {t(value)}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

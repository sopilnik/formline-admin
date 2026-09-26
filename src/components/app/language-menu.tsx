'use client'

import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LOCALES, type Locale } from '@/i18n/locale'
import { setLocaleAction } from '@/server/actions/preferences'

export function LanguageMenu({ locale }: { locale: Locale }) {
  const t = useTranslations('language')
  const [, startTransition] = useTransition()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" aria-label={t('label', { name: t(locale) })} />}>
        {locale.toUpperCase()}
        <ChevronDown aria-hidden className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup value={locale} onValueChange={value => startTransition(async () => { await setLocaleAction(String(value)) })}>
          {LOCALES.map(value => (
            <DropdownMenuRadioItem key={value} value={value} lang={value}>
              {t(value)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

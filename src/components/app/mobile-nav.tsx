'use client'

import { Menu, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Brand } from '@/components/app/brand'
import type { NavItem } from '@/components/app/nav'
import { NavLinks } from '@/components/app/nav-links'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

/** Below 768 px the menu is a drawer (spec §11). */
export function MobileNav({ items }: { items: NavItem[] }) {
  const t = useTranslations('nav')
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label={t('open')} />}>
        <Menu aria-hidden />
      </SheetTrigger>
      <SheetContent side="left" showCloseButton={false} className="dark w-[280px] gap-1 border-sidebar-border bg-sidebar p-3.5 text-sidebar-foreground">
        <SheetTitle className="sr-only">{t('label')}</SheetTitle>
        <SheetClose render={<Button variant="ghost" size="icon" className="absolute top-3 right-3" aria-label={t('close')} />}>
          <X aria-hidden />
        </SheetClose>
        <Brand />
        <nav aria-label={t('label')}>
          <NavLinks items={items} onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  )
}

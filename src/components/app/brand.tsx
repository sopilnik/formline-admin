import { useTranslations } from 'next-intl'
import { SIDEBAR_LABEL } from '@/components/app/sidebar-label'
import { cn } from '@/lib/utils'

/** The Formline mark and name; the name stays in Space Grotesk in every language (spec §11). */
export function Brand({ collapsed = false }: { collapsed?: boolean }) {
  const t = useTranslations('common')
  return (
    <div className="flex items-center gap-2.5 px-2 pt-1 pb-4">
      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-[7px] bg-sidebar-bar font-brand text-[17px] font-bold text-sidebar-bar-foreground">
        F
      </span>
      <span className={cn('leading-tight', SIDEBAR_LABEL, collapsed && 'opacity-0')}>
        <span className="block font-brand text-base font-bold tracking-tight text-sidebar-strong">Formline</span>
        <span className="block text-xs text-sidebar-muted">{t('brandSub')}</span>
      </span>
    </div>
  )
}

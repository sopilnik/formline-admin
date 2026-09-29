import { ChevronDown } from 'lucide-react'
import type { ChangeEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  id: string
  label: string
  value: string
  /** A filter that differs from its default shows its value in the selected style (spec §8.2). */
  active?: boolean
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void
  children: ReactNode
}

/** A native select in the panel's look: it works in a plain form and opens the system picker on phones. */
export function FilterSelect({ id, label, value, active = false, onChange, children }: Props) {
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <select
        id={id}
        value={value}
        onChange={onChange}
        className={cn(
          'h-8 appearance-none rounded-lg border border-input bg-card pr-8 pl-3 text-[13px] text-ink-2 [&>option]:bg-card [&>option]:text-foreground',
          active && 'border-selected bg-selected text-selected-foreground',
        )}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className={cn('pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground', active && 'text-selected-foreground')} />
    </div>
  )
}

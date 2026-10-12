'use client'

import { Check } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ALL, statusesFrom } from '@/lib/list-filters'

const CHIP = 'h-8 shrink-0 gap-1.5 rounded-full border border-input bg-card px-3 text-[13px] font-normal text-ink-2 data-pressed:border-selected'
const COUNT = 'text-xs text-muted-foreground tabular-nums group-data-pressed/toggle:text-selected-foreground'

type Props<S extends string> = {
  /** The group's accessible name. */
  label: string
  /** The text of the "all" chip. */
  allLabel: string
  statuses: readonly S[]
  /** The statuses the list shows; none means all of them. */
  selected: readonly S[]
  counts: Record<S, number>
  statusLabel: (status: S) => string
  onChange: (statuses: S[]) => void
}

/** A list's status chips with their counts: "all", then one chip per status, any number of them pressed at once. */
export function StatusChips<S extends string>({ label, allLabel, statuses, selected, counts, statusLabel, onChange }: Props<S>) {
  const all = statuses.reduce((sum, status) => sum + counts[status], 0)
  return (
    <ToggleGroup
      multiple
      aria-label={label}
      value={selected.length > 0 ? [...selected] : [ALL]}
      onValueChange={next => onChange(statusesFrom(statuses, next, selected))}
      className="-mx-4 w-auto flex-nowrap overflow-x-auto px-4 -mt-1 pt-1 pb-1 md:mx-0 md:mt-0 md:flex-wrap md:overflow-visible md:px-0 md:pt-0 md:pb-0"
    >
      <ToggleGroupItem value={ALL} aria-label={`${allLabel}, ${all}`} className={CHIP}>
        <Check aria-hidden className="hidden size-3.5 group-data-pressed/toggle:block" strokeWidth={2.5} />
        {allLabel}
        <span className={COUNT}>{all}</span>
      </ToggleGroupItem>
      {statuses.map(status => (
        <ToggleGroupItem key={status} value={status} aria-label={`${statusLabel(status)}, ${counts[status]}`} className={CHIP}>
          <Check aria-hidden className="hidden size-3.5 group-data-pressed/toggle:block" strokeWidth={2.5} />
          {statusLabel(status)}
          <span className={COUNT}>{counts[status]}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

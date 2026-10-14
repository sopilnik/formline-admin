'use client'

import { Check } from 'lucide-react'
import { Toggle } from '@/components/ui/toggle'
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

/**
 * A list's status chips with their counts: "all", then one chip per status, any number of them pressed at once. Each chip
 * is a button of its own in the Tab order (the owner's decision of 13 October), not a stop of a group moved with arrows.
 */
export function StatusChips<S extends string>({ label, allLabel, statuses, selected, counts, statusLabel, onChange }: Props<S>) {
  const all = statuses.reduce((sum, status) => sum + counts[status], 0)
  const pressed: string[] = selected.length > 0 ? [...selected] : [ALL]
  const press = (chip: string, on: boolean): void => onChange(statusesFrom(statuses, on ? [...pressed, chip] : pressed.filter(value => value !== chip), selected))

  return (
    <div
      role="group"
      aria-label={label}
      // On a phone the row scrolls sideways without a bar, and its right edge fades to show there is more. The wider end
      // padding lets the last chip clear the fade, and the scroll padding keeps a focused chip's ring clear of both edges.
      className="-mx-4 -mt-1 flex w-auto scroll-pr-10 scroll-pl-4 flex-nowrap items-center gap-2 overflow-x-auto pt-1 pr-10 pb-1 pl-4 [mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] [scrollbar-width:none] md:mx-0 md:mt-0 md:flex-wrap md:overflow-visible md:px-0 md:pt-0 md:pb-0 md:[mask-image:none] [&::-webkit-scrollbar]:hidden"
    >
      <Toggle pressed={pressed.includes(ALL)} onPressedChange={on => press(ALL, on)} aria-label={`${allLabel}, ${all}`} className={CHIP}>
        <Check aria-hidden className="hidden size-3.5 group-data-pressed/toggle:block" strokeWidth={2.5} />
        {allLabel}
        <span className={COUNT}>{all}</span>
      </Toggle>
      {statuses.map(status => (
        <Toggle key={status} pressed={pressed.includes(status)} onPressedChange={on => press(status, on)} aria-label={`${statusLabel(status)}, ${counts[status]}`} className={CHIP}>
          <Check aria-hidden className="hidden size-3.5 group-data-pressed/toggle:block" strokeWidth={2.5} />
          {statusLabel(status)}
          <span className={COUNT}>{counts[status]}</span>
        </Toggle>
      ))}
    </div>
  )
}

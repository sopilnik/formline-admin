'use client'

import { Info } from 'lucide-react'
import { useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * The (i) beside a metric: its explanation shows on hover and focus, and a press opens or closes it, so a finger on a
 * touch screen reaches it too. A screen reader hears it with the button (`describedBy`).
 */
export function MetricHint({ label, hint, describedBy }: { label: string; hint: string; describedBy: string }) {
  const [open, setOpen] = useState(false)

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        closeOnClick={false}
        render={(
          <button
            type="button" aria-label={label} aria-describedby={describedBy} onClick={() => setOpen(current => !current)}
            className="grid size-6 place-items-center rounded-full hover:text-foreground"
          />
        )}
      >
        <Info aria-hidden className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{hint}</TooltipContent>
    </Tooltip>
  )
}

'use client'

import { CSPProvider } from '@base-ui/react/csp-provider'
import type { ReactNode } from 'react'
import { ToastProvider } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'

/** Client-side context for every page: the CSP nonce for Base UI, tooltips and toasts. */
export function Providers({ nonce, closeLabel, regionLabel, children }: { nonce: string | undefined; closeLabel: string; regionLabel: string; children: ReactNode }) {
  return (
    <CSPProvider nonce={nonce}>
      <TooltipProvider delay={300}>
        <ToastProvider closeLabel={closeLabel} regionLabel={regionLabel}>{children}</ToastProvider>
      </TooltipProvider>
    </CSPProvider>
  )
}

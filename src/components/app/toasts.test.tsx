import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ToastProvider, useToast } from '@/components/ui/toast'

describe('toasts', () => {
  it('hand out the same functions to every component and every render, so an effect may list them', () => {
    const seen: unknown[] = []

    function Probe() {
      seen.push(useToast())

      return null
    }
    renderToStaticMarkup(<ToastProvider closeLabel="Dismiss" regionLabel="Messages"><Probe /><Probe /></ToastProvider>)
    renderToStaticMarkup(<ToastProvider closeLabel="Dismiss" regionLabel="Messages"><Probe /></ToastProvider>)
    expect(seen).toHaveLength(3)
    expect(new Set(seen).size).toBe(1)
  })
})

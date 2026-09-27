'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useEffect, useEffectEvent, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { NOTE_MAX } from '@/lib/orders/note'
import { addOrderNoteAction, type NoteState } from '@/server/actions/orders'

const IDLE: NoteState = { status: 'idle' }

/** The internal note form (amendment 8). After an error the text comes back: React resets the form after every result. */
export function OrderNoteForm({ orderId }: { orderId: string }) {
  const t = useTranslations('orders.detail')
  const toast = useToast()
  const field = useRef<HTMLTextAreaElement>(null)
  const [state, action, pending] = useActionState(addOrderNoteAction, IDLE)
  // Once per result: an effect that listed `toast` would run again after every toast it shows
  // (useToast returns a new object on each render) and loop.
  const settle = useEffectEvent((result: NoteState) => {
    if (result.status === 'done') toast.success(t('noteAdded'))
    if (result.status === 'error') field.current?.focus()
  })
  useEffect(() => settle(state), [state])
  const error = state.status === 'error' ? t(`noteErrors.${state.error}`) : null
  return (
    <form action={action} className="flex flex-col gap-2 border-t pt-4">
      <input type="hidden" name="orderId" value={orderId} />
      <Label htmlFor="order-note">{t('noteLabel')}</Label>
      <textarea
        ref={field}
        id="order-note"
        name="note"
        rows={3}
        maxLength={NOTE_MAX}
        defaultValue={state.status === 'error' ? state.note : ''}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'order-note-hint order-note-error' : 'order-note-hint'}
        className="w-full rounded-lg border border-input bg-card px-2.5 py-2 text-sm placeholder:text-muted-foreground aria-invalid:border-destructive"
      />
      <p id="order-note-hint" className="text-xs text-muted-foreground">{t('noteHint')}</p>
      {error ? <p id="order-note-error" className="text-sm text-destructive">{error}</p> : null}
      <div>
        <Button type="submit" size="sm" disabled={pending}>{pending ? t('adding') : t('addNote')}</Button>
      </div>
    </form>
  )
}

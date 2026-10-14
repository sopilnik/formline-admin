'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useEffectEvent, useRef } from 'react'
import { TextAreaField } from '@/components/app/form-fields'
import { UnreachedAlert, useFormAction, useLeaveGuard } from '@/components/app/form-parts'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { NOTE_MAX } from '@/lib/orders/note'
import { addOrderNoteAction, type NoteState } from '@/server/actions/orders'

const IDLE: NoteState = { status: 'idle' }

/** The internal note form. After an error the text comes back: React resets the form after every result. */
export function OrderNoteForm({ orderId }: { orderId: string }) {
  const t = useTranslations('orders.detail')
  const toast = useToast()
  const field = useRef<HTMLTextAreaElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const [state, action, pending, unreached] = useFormAction(addOrderNoteAction, IDLE, form)
  useLeaveGuard(form, state.status === 'error')
  // Once per result, with the latest translations.
  const settle = useEffectEvent((result: NoteState) => {
    if (result.status === 'done') toast.success(t('noteAdded'))
    if (result.status === 'error') field.current?.focus()
  })
  useEffect(() => settle(state), [state])
  const error = state.status === 'error' ? t(`noteErrors.${state.error}`) : undefined
  return (
    <form ref={form} action={action} className="flex flex-col gap-2 border-t pt-4">
      <UnreachedAlert unreached={unreached} />
      <input type="hidden" name="orderId" value={orderId} />
      <TextAreaField
        ref={field}
        id="order-note"
        name="note"
        label={t('noteLabel')}
        hint={t('noteHint')}
        error={error}
        rows={3}
        maxLength={NOTE_MAX}
        defaultValue={state.status === 'error' ? state.note : ''}
      />
      <div>
        <Button type="submit" disabled={pending}>{pending ? t('adding') : t('addNote')}</Button>
      </div>
    </form>
  )
}

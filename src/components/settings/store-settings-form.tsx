'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useEffect, useEffectEvent, useRef } from 'react'
import { SelectField } from '@/components/app/form-fields'
import { TextField } from '@/components/auth/text-field'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { LOW_STOCK_MAX, STORE_FIELDS, STORE_NAME_MAX, SUPPORT_EMAIL_MAX, type StoreField } from '@/lib/settings/fields'
import { saveStoreSettingsAction, type StoreSettingsState } from '@/server/actions/settings'

const IDLE: StoreSettingsState = { status: 'idle' }

/** Settings → Store (spec §8.8): the store's name, its support email, its time zone and the threshold new variants start with. */
export function StoreSettingsForm({ settings, zones }: { settings: Record<StoreField, string>; zones: string[] }) {
  const t = useTranslations('settings.store')
  const toast = useToast()
  const form = useRef<HTMLFormElement>(null)
  const [state, action, pending] = useActionState(saveStoreSettingsAction, IDLE)
  const settle = useEffectEvent((result: StoreSettingsState) => {
    if (result.status === 'done') toast.success(t('saved'))
    if (result.status === 'error') {
      const first = STORE_FIELDS.find(field => result.fieldErrors[field])
      form.current?.querySelector<HTMLElement>(first ? `[name="${first}"]` : '[role="alert"]')?.focus()
    }
  })
  useEffect(() => settle(state), [state])
  const error = state.status === 'error' ? state : null
  const values = error?.values ?? settings
  const message = (field: StoreField): string | undefined => (error?.fieldErrors[field] ? t(`errors.${error.fieldErrors[field]}`) : undefined)
  return (
    <form ref={form} action={action} noValidate className="flex max-w-md flex-col gap-4">
      {error && error.error !== 'invalid' ? (
        <p role="alert" tabIndex={-1} className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">{t(`errors.${error.error}`)}</p>
      ) : null}
      <TextField id="store-name" name="storeName" label={t('name')} maxLength={STORE_NAME_MAX} aria-required defaultValue={values.storeName} error={message('storeName')} />
      <TextField
        id="store-email" name="supportEmail" type="email" label={t('supportEmail')} hint={t('supportEmailHint')} maxLength={SUPPORT_EMAIL_MAX} aria-required
        defaultValue={values.supportEmail} error={message('supportEmail')}
      />
      <SelectField id="store-timezone" name="timezone" label={t('timezone')} hint={t('timezoneHint')} defaultValue={values.timezone} error={message('timezone')}>
        {zones.map(zone => <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>)}
      </SelectField>
      <TextField
        id="store-low-stock" name="lowStockDefault" label={t('lowStock')} hint={t('lowStockHint', { max: LOW_STOCK_MAX })} inputMode="numeric"
        maxLength={3} aria-required defaultValue={values.lowStockDefault} error={message('lowStockDefault')} className="w-28"
      />
      <div>
        <Button type="submit" disabled={pending}>{pending ? t('saving') : t('save')}</Button>
      </div>
    </form>
  )
}

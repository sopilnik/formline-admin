'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useEffect, useEffectEvent, useRef } from 'react'
import { SelectField } from '@/components/app/form-fields'
import { TextField } from '@/components/auth/text-field'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { LOCALES } from '@/i18n/locale'
import { NAME_MAX, PROFILE_FIELDS, type ProfileField } from '@/lib/settings/fields'
import { THEMES } from '@/lib/theme'
import { saveProfileAction, type ProfileState } from '@/server/actions/settings'

const IDLE: ProfileState = { status: 'idle' }

/** Settings → Profile (spec §8.8). After a save the page follows the new language and theme. */
export function ProfileForm({ profile }: { profile: Record<ProfileField, string> }) {
  const t = useTranslations('settings.profile')
  const language = useTranslations('language')
  const theme = useTranslations('theme')
  const toast = useToast()
  const form = useRef<HTMLFormElement>(null)
  const [state, action, pending] = useActionState(saveProfileAction, IDLE)
  const settle = useEffectEvent((result: ProfileState) => {
    if (result.status === 'done') toast.success(t('saved'))
    if (result.status === 'error') {
      const first = PROFILE_FIELDS.find(field => result.fieldErrors[field])
      form.current?.querySelector<HTMLElement>(first ? `[name="${first}"]` : '[role="alert"]')?.focus()
    }
  })
  useEffect(() => settle(state), [state])
  const error = state.status === 'error' ? state : null
  const values = error?.values ?? profile
  const message = (field: ProfileField): string | undefined => (error?.fieldErrors[field] ? t(`errors.${error.fieldErrors[field]}`) : undefined)
  return (
    <form ref={form} action={action} noValidate className="flex max-w-md flex-col gap-4">
      {error?.error === 'forbidden' ? (
        <p role="alert" tabIndex={-1} className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">{t('errors.forbidden')}</p>
      ) : null}
      <TextField id="profile-name" name="name" label={t('name')} autoComplete="name" maxLength={NAME_MAX} aria-required defaultValue={values.name} error={message('name')} />
      <SelectField id="profile-locale" name="locale" label={t('language')} defaultValue={values.locale} error={message('locale')}>
        {LOCALES.map(option => <option key={option} value={option}>{language(option)}</option>)}
      </SelectField>
      <SelectField id="profile-theme" name="theme" label={t('theme')} defaultValue={values.theme} error={message('theme')}>
        {THEMES.map(option => <option key={option} value={option}>{theme(option)}</option>)}
      </SelectField>
      <div>
        <Button type="submit" disabled={pending}>{pending ? t('saving') : t('save')}</Button>
      </div>
    </form>
  )
}

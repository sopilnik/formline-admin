'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useEffectEvent, useRef } from 'react'
import { SelectField, TextField } from '@/components/app/form-fields'
import { ErrorAlert, UnreachedAlert, useFormAction, useLeaveGuard } from '@/components/app/form-parts'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { LOCALES } from '@/i18n/locale'
import { PROFILE_FIELDS, type ProfileField } from '@/lib/settings/fields'
import { MEMBER_NAME_MAX } from '@/lib/team'
import { THEMES } from '@/lib/theme'
import { saveProfileAction, type ProfileState } from '@/server/actions/settings'

const IDLE: ProfileState = { status: 'idle' }

/** Settings → Profile. After a save the page follows the new language and theme. */
export function ProfileForm({ profile }: { profile: Record<ProfileField, string> }) {
  const t = useTranslations('settings.profile')
  const language = useTranslations('language')
  const theme = useTranslations('theme')
  const toast = useToast()
  const form = useRef<HTMLFormElement>(null)
  const [state, action, pending, unreached] = useFormAction(saveProfileAction, IDLE, form)

  useLeaveGuard(form, state.status === 'error')

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
      <UnreachedAlert unreached={unreached} />
      {error && error.error !== 'invalid' ? (
        <ErrorAlert>{t(`errors.${error.error}`)}</ErrorAlert>
      ) : null}
      <TextField id="profile-name" name="name" label={t('name')} autoComplete="name" maxLength={MEMBER_NAME_MAX} aria-required defaultValue={values.name} error={message('name')} />
      <SelectField id="profile-locale" name="locale" label={t('language')} defaultValue={values.locale} error={message('locale')}>
        {LOCALES.map(option => <option key={option} value={option}>{language(option)}</option>)}
      </SelectField>
      <SelectField id="profile-theme" name="theme" label={t('theme')} defaultValue={values.theme} error={message('theme')}>
        {THEMES.map(option => <option key={option} value={option}>{theme(option)}</option>)}
      </SelectField>
      {/* A plain checkbox: after a failed save the form's reset puts back exactly what was ticked. */}
      <div className="flex flex-col gap-1">
        <label className="flex min-h-6 items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="shortcuts" defaultChecked={values.shortcuts === 'on'} aria-describedby="profile-shortcuts-hint" className="size-4 accent-selected" />
          {t('shortcuts')}
        </label>
        <p id="profile-shortcuts-hint" className="pl-6 text-xs text-muted-foreground">{t('shortcutsHint')}</p>
      </div>
      <div>
        <Button type="submit" disabled={pending}>{pending ? t('saving') : t('save')}</Button>
      </div>
    </form>
  )
}

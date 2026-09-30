import { describe, expect, it } from 'vitest'
import { parseProfile, parseStoreSettings } from '@/lib/settings/form'

describe('parseProfile', () => {
  it('trims the name and takes a language, a theme and the shortcut switch', () => {
    expect(parseProfile({ name: '  Dana Ortiz ', locale: 'ru', theme: 'dark', shortcuts: 'on' }))
      .toEqual({ ok: true, data: { name: 'Dana Ortiz', locale: 'ru', theme: 'dark', shortcuts: true } })
    expect(parseProfile({ name: 'Dana Ortiz', locale: 'en', theme: 'light', shortcuts: '' }))
      .toEqual({ ok: true, data: { name: 'Dana Ortiz', locale: 'en', theme: 'light', shortcuts: false } })
  })

  it('names every wrong field', () => {
    expect(parseProfile({ name: ' ', locale: 'de', theme: 'blue', shortcuts: '' })).toEqual({ ok: false, fieldErrors: { name: 'required', locale: 'invalid', theme: 'invalid' } })
    expect(parseProfile({ name: 'ж'.repeat(121), locale: 'en', theme: 'system', shortcuts: '' })).toEqual({ ok: false, fieldErrors: { name: 'too_long' } })
    expect(parseProfile({ name: 'ж'.repeat(120), locale: 'en', theme: 'system', shortcuts: 'on' }).ok).toBe(true)
  })
})

describe('parseStoreSettings', () => {
  const valid = { storeName: ' Formline ', supportEmail: 'Help@Formline.example', timezone: 'Asia/Almaty', lowStockDefault: '5' }

  it('trims, lowers the email and reads the threshold', () => {
    expect(parseStoreSettings(valid)).toEqual({ ok: true, data: { storeName: 'Formline', supportEmail: 'help@formline.example', timezone: 'Asia/Almaty', lowStockDefault: 5 } })
    expect(parseStoreSettings({ ...valid, lowStockDefault: '0' }).ok).toBe(true)
    expect(parseStoreSettings({ ...valid, lowStockDefault: '999' }).ok).toBe(true)
  })

  it('refuses an unknown time zone, a bad email and a threshold outside 0–999', () => {
    expect(parseStoreSettings({ storeName: '', supportEmail: 'help', timezone: 'Mars/Olympus', lowStockDefault: '1000' })).toEqual({
      ok: false, fieldErrors: { storeName: 'required', supportEmail: 'email_invalid', timezone: 'timezone_invalid', lowStockDefault: 'number_invalid' },
    })
    for (const lowStockDefault of ['-1', '2.5', 'three', '']) expect(parseStoreSettings({ ...valid, lowStockDefault }).ok, lowStockDefault).toBe(false)
    // The canonical spelling only: the select offers the platform's list as it is.
    expect(parseStoreSettings({ ...valid, timezone: 'asia/almaty' })).toEqual({ ok: false, fieldErrors: { timezone: 'timezone_invalid' } })
    expect(parseStoreSettings({ ...valid, storeName: 'x'.repeat(81) })).toEqual({ ok: false, fieldErrors: { storeName: 'too_long' } })
  })
})

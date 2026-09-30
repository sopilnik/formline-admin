import { describe, expect, it } from 'vitest'
import { letterContent } from '@/lib/letters'

const tz = 'Europe/Berlin'

describe('letterContent', () => {
  it('writes the new sign-in letter in the recipient’s language, with the date in the store zone and the device', () => {
    expect(letterContent('auth.new_sign_in', { at: '2026-09-29T12:05:00.000Z', device: 'Chrome, macOS', name: 'Dana Ortiz', locale: 'ru' }, tz)).toEqual({
      locale: 'ru', name: 'Dana Ortiz',
      subject: { key: 'newSignIn.subject' },
      paragraphs: [{ key: 'newSignIn.body', values: { date: '29 сент., 14:05', device: 'Chrome, macOS' } }, { key: 'newSignIn.ifNotYou' }],
      action: { key: 'newSignIn.action', href: '/settings/security' },
    })
  })

  it('leaves the device out when the sign-in had none', () => {
    const letter = letterContent('auth.new_sign_in', { at: '2026-09-29T12:05:00.000Z', device: null }, tz)
    expect(letter.locale).toBe('en')
    expect(letter.name).toBeNull()
    expect(letter.paragraphs[0]).toEqual({ key: 'newSignIn.bodyNoDevice', values: { date: '29 Sept, 14:05' } })
  })

  it('counts the recovery codes left and links every security letter to the security settings', () => {
    const used = letterContent('auth.recovery_code_used', { at: '2026-09-29T12:05:00.000Z', remaining: 7 }, tz)
    expect(used.paragraphs[0]).toEqual({ key: 'recoveryCodeUsed.body', values: { date: '29 Sept, 14:05', remaining: 7 } })
    expect(used.action?.href).toBe('/settings/security')
    expect(letterContent('auth.second_factor_locked', {}, tz).action?.href).toBe('/settings/security')
  })

  it('writes the invitation for someone who is not a member yet, with its link and the invited role', () => {
    const token = 'abcdefghijklmnopqrstuvwxyz234567'
    expect(letterContent('team.invitation', { inviter: 'Dana Ortiz', role: 'manager', token, locale: 'en' }, tz)).toEqual({
      locale: 'en', name: null,
      subject: { key: 'invitation.subject', values: { inviter: 'Dana Ortiz' } },
      paragraphs: [{ key: 'invitation.body.manager', values: { inviter: 'Dana Ortiz' } }, { key: 'invitation.note' }],
      action: { key: 'invitation.action', href: `/invite/${token}` },
    })
    const odd = letterContent('team.invitation', { inviter: 'Dana Ortiz', role: 'owner', token: '../settings' }, tz)
    expect(odd.paragraphs[0]!.key).toBe('invitation.body.unknown')
    expect(odd.action).toBeNull()
  })

  it('falls back instead of failing on a malformed payload or an unknown template', () => {
    expect(letterContent('auth.second_factor_locked', { at: 'yesterday', locale: 'de' }, tz).paragraphs[0])
      .toEqual({ key: 'secondFactorLocked.body', values: { date: '—' } })
    expect(letterContent('auth.recovery_code_used', { remaining: -3 }, tz).paragraphs[0]!.values?.remaining).toBe(0)
    expect(letterContent('invite', null, tz)).toEqual({
      locale: 'en', name: null, subject: { key: 'unknown.subject' }, paragraphs: [{ key: 'unknown.body' }], action: null,
    })
  })
})

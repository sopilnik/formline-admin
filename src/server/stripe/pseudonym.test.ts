import { describe, expect, it } from 'vitest'
import { pseudonymFor } from '@/server/stripe/pseudonym'

const KEY = 'k'.repeat(32)

describe('pseudonymFor', () => {
  it('turns one customer into the same demo person every time, whatever the case of the email', () => {
    const person = pseudonymFor('Mia.Novak@example.com', KEY)
    expect(pseudonymFor(' mia.novak@example.com ', KEY)).toEqual(person)
    expect(person.name).toMatch(/^[A-Z][a-z]+ [A-Za-z ]+$/)
    expect(person.email).toMatch(/^[a-z]+\.[a-z]+\.[0-9a-f]{8}@pseudonym\.example$/)
    expect(person.country).toMatch(/^[A-Z]{2}$/)
  })

  it('gives another customer another email, and another key another person', () => {
    const person = pseudonymFor('mia.novak@example.com', KEY)
    expect(pseudonymFor('lukas.weber@example.com', KEY).email).not.toBe(person.email)
    expect(pseudonymFor('mia.novak@example.com', 'q'.repeat(32)).email).not.toBe(person.email)
  })

  it('keeps nothing of the email it came from', () => {
    expect(JSON.stringify(pseudonymFor('zed.quill@mailbox.test', KEY))).not.toMatch(/zed|quill|mailbox/i)
  })
})

import { describe, expect, it } from 'vitest'
import { MEMBER_NAME_MAX, memberName } from '@/lib/team'

describe('memberName', () => {
  it('keeps a trimmed name of one character up to the limit, counted in characters', () => {
    expect(memberName('  Alex Kim ')).toBe('Alex Kim')
    expect(memberName('Я')).toBe('Я')
    expect(memberName('😀'.repeat(MEMBER_NAME_MAX))).toBe('😀'.repeat(MEMBER_NAME_MAX))
  })

  it('refuses an empty name and one longer than the limit', () => {
    expect(memberName('   ')).toBeNull()
    expect(memberName('a'.repeat(MEMBER_NAME_MAX + 1))).toBeNull()
  })
})

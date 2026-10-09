import { describe, expect, it } from 'vitest'
import { precheckUpload, UPLOAD_MAX_BYTES } from '@/lib/uploads'

describe('precheckUpload', () => {
  it('passes the three image types up to the limit', () => {
    expect(precheckUpload({ type: 'image/jpeg', size: UPLOAD_MAX_BYTES })).toBeNull()
    expect(precheckUpload({ type: 'image/png', size: 1 })).toBeNull()
    expect(precheckUpload({ type: 'image/webp', size: 1 })).toBeNull()
  })

  it('names the size first, then the type', () => {
    expect(precheckUpload({ type: 'image/png', size: UPLOAD_MAX_BYTES + 1 })).toBe('too_large')
    expect(precheckUpload({ type: 'image/svg+xml', size: UPLOAD_MAX_BYTES + 1 })).toBe('too_large')
    expect(precheckUpload({ type: 'image/svg+xml', size: 10 })).toBe('type')
    expect(precheckUpload({ type: '', size: 10 })).toBe('type')
  })
})

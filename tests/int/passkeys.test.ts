import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { encodeBase64urlNoPadding } from '@/lib/encoding'
import { beginRegistration, challengeCookie, handleFromUserId, markChallengeUsed, readChallenge, removeOwnPasskey, signInWithPasskey } from '@/server/auth/passkeys'
import type { Session } from '@/server/auth/sessions'
import { authConfig } from '@/server/config'
import { adminPool, appPool, closeAll } from './db'
import { asSchemaOwner, createUser, createWorkspace } from './fixtures'
import { ensureOwner } from './owner'

let admin: pg.Pool
let app: pg.Pool
let ownerId: string
let ownerWorkspace: string

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  ownerId = await ensureOwner(admin, app)
  ownerWorkspace = (await admin.query<{ id: string }>("select id from fa.workspaces where kind = 'owner'")).rows[0]!.id
})
// The owner is shared by every file: the passkeys these tests leave behind go with them.
afterAll(async () => {
  await admin.query('delete from fa.passkeys where workspace_id = $1 and user_id = $2', [ownerWorkspace, ownerId])
  await closeAll()
})

const config = () => authConfig()
const meta = { ip: '192.0.2.200', userAgent: null }

const ownerSession = (reauthAt: Date | null = new Date()): Session => ({
  id: 'a'.repeat(64), workspaceId: ownerWorkspace, workspaceKind: 'owner', userId: ownerId, role: 'owner',
  secondFactorVerified: true, reauthAt, expiresAt: new Date(Date.now() + 3_600_000),
})

function assertion(credentialId: string, userId: string): AuthenticationResponseJSON {
  return {
    id: credentialId,
    rawId: credentialId,
    type: 'public-key',
    clientExtensionResults: {},
    response: { clientDataJSON: 'e30', authenticatorData: 'AA', signature: 'AA', userHandle: encodeBase64urlNoPadding(handleFromUserId(userId)) },
  }
}

async function addPasskeyRow(credentialId: string): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    "insert into fa.passkeys (workspace_id, user_id, credential_id, public_key, name) values ($1, $2, $3, 'pk', 'Laptop') returning id",
    [ownerWorkspace, ownerId, credentialId])

  return rows[0]!.id
}

describe('challenges', () => {
  it('count once', async () => {
    const challenge = `challenge-${crypto.randomUUID()}`

    expect(await markChallengeUsed(challenge, app)).toBe(true)
    expect(await markChallengeUsed(challenge, app)).toBe(false)
  })
})

describe('signInWithPasskey', () => {
  it('reports an unknown credential so the browser can forget it', async () => {
    const cookie = challengeCookie({ challenge: `c-${crypto.randomUUID()}`, purpose: 'auth' }, config(), Date.now())
    const credentialId = `unknown${crypto.randomUUID().replace(/-/g, '')}`

    expect(await signInWithPasskey({ response: assertion(credentialId, ownerId), cookie: cookie, meta }, { pool: app }))
      .toEqual({ ok: false, error: 'passkey_unknown', credentialId })
  })

  it('refuses without a valid challenge cookie', async () => {
    const credentialId = `known${crypto.randomUUID().replace(/-/g, '')}`

    await addPasskeyRow(credentialId)
    expect(await signInWithPasskey({ response: assertion(credentialId, ownerId), cookie: undefined, meta }, { pool: app })).toEqual({ ok: false, error: 'passkey_failed' })
    expect(await signInWithPasskey({ response: assertion(credentialId, ownerId), cookie: 'forged.value', meta }, { pool: app })).toEqual({ ok: false, error: 'passkey_failed' })
  })

  it('refuses a response that does not verify, and burns its challenge', async () => {
    const credentialId = `known${crypto.randomUUID().replace(/-/g, '')}`

    await addPasskeyRow(credentialId)

    const challenge = `c-${crypto.randomUUID()}`
    const cookie = challengeCookie({ challenge: challenge, purpose: 'auth' }, config(), Date.now())

    expect(await signInWithPasskey({ response: assertion(credentialId, ownerId), cookie: cookie, meta }, { pool: app })).toEqual({ ok: false, error: 'passkey_failed' })
    expect(await markChallengeUsed(challenge, app)).toBe(false)
  })
})

describe('registration', () => {
  it('offers passkeys in the owner workspace only, after a recent authentication', async () => {
    const sandbox = await createWorkspace(admin)
    const member = await createUser(admin, sandbox, 'owner')
    const sandboxSession: Session = { ...ownerSession(), workspaceId: sandbox, workspaceKind: 'sandbox', userId: member }

    expect(await beginRegistration(sandboxSession, { pool: app })).toEqual({ ok: false, error: 'generic' })
    expect(await beginRegistration(ownerSession(new Date(Date.now() - 3_600_000)), { pool: app })).toEqual({ ok: false, error: 'reauth_required' })
  })

  it('asks for a discoverable, user-verified passkey bound to the owner and excludes the known ones', async () => {
    const credentialId = `known${crypto.randomUUID().replace(/-/g, '')}`

    await addPasskeyRow(credentialId)

    const session = ownerSession()
    const result = await beginRegistration(session, { pool: app })

    if (!result.ok) throw new Error(result.error)
    expect(result.options.rp.id).toBe('localhost')
    expect(result.options.user.id.replace(/=+$/, '')).toBe(encodeBase64urlNoPadding(handleFromUserId(ownerId)))
    expect(result.options.attestation).toBe('none')
    expect(result.options.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' })
    expect(result.options.excludeCredentials?.map(c => c.id)).toContain(credentialId)
    expect(readChallenge({ value: result.cookie, purpose: 'register', sessionId: session.id }, config(), Date.now())).toBe(result.options.challenge)
  })
})

describe('removing a passkey', () => {
  it('keeps the last second factor', async () => {
    const saved = (await admin.query<{ enc: string }>('select totp_secret_enc as enc from fa.users where id = $1', [ownerId])).rows[0]!.enc

    await admin.query('delete from fa.passkeys where user_id = $1', [ownerId])

    const only = await addPasskeyRow(`only${crypto.randomUUID().replace(/-/g, '')}`)

    // Changes to the owner row go through schema_owner: the users trigger refuses them from anyone else.
    try {
      await asSchemaOwner(admin, c => c.query('update fa.users set totp_secret_enc = null where id = $1', [ownerId]))
      expect(await removeOwnPasskey(ownerSession(), { passkeyId: only, meta }, { pool: app })).toEqual({ ok: false, error: 'last_factor' })
    } finally {
      await asSchemaOwner(admin, c => c.query('update fa.users set totp_secret_enc = $2 where id = $1', [ownerId, saved]))
    }
    expect(await removeOwnPasskey(ownerSession(), { passkeyId: only, meta }, { pool: app })).toEqual({ ok: true })
  })

  it('waits for a running change to the owner\'s factors before it counts them', async () => {
    const id = await addPasskeyRow(`wait${crypto.randomUUID().replace(/-/g, '')}`)
    const holder = await admin.connect()

    try {
      // Another change holds the owner's row; the removal may count the factors only once that change has ended. The
      // holder's lock lets the activity log's foreign key through, so only the removal's own lock of the row waits.
      await holder.query('begin')
      await holder.query('select 1 from fa.users where id = $1 for no key update', [ownerId])

      let settled = false
      const removing = removeOwnPasskey(ownerSession(), { passkeyId: id, meta }, { pool: app }).finally(() => { settled = true })

      await new Promise(resolve => setTimeout(resolve, 500))
      expect(settled).toBe(false)

      await holder.query('commit')
      expect(await removing).toEqual({ ok: true })
    } finally {
      await holder.query('rollback').catch(() => undefined)
      holder.release()
    }
  })

  it('needs a recent authentication', async () => {
    const id = await addPasskeyRow(`stale${crypto.randomUUID().replace(/-/g, '')}`)

    expect(await removeOwnPasskey(ownerSession(new Date(Date.now() - 3_600_000)), { passkeyId: id, meta }, { pool: app }))
      .toEqual({ ok: false, error: 'reauth_required' })
  })
})

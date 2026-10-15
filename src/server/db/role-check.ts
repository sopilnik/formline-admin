import type { Pool } from 'pg'

export class AppRoleError extends Error {}

type RoleRow = {
  rolname: string
  rolsuper: boolean
  rolbypassrls: boolean
  rolcreaterole: boolean
  rolcreatedb: boolean
  memberships: number
  owned: number
}

/**
 * Refuses to let the server run on an over-privileged database role. A role
 * created in the Neon Console joins neon_superuser (BYPASSRLS, CREATEROLE,
 * CREATEDB); only the SQL-created app role passes.
 */
export async function assertAppRole(pool: Pool): Promise<void> {
  const { rows } = await pool.query<RoleRow>(`
    select r.rolname, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb,
      (select count(*)::int from pg_catalog.pg_auth_members m where m.member = r.oid) as memberships,
      (select count(*)::int from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'fa' and c.relowner = r.oid) as owned
    from pg_catalog.pg_roles r where r.rolname = current_user`)
  const role = rows[0]

  if (!role) throw new AppRoleError('the current database role was not found')

  const problems = [
    role.rolsuper && 'superuser',
    role.rolbypassrls && 'bypassrls',
    role.rolcreaterole && 'createrole',
    role.rolcreatedb && 'createdb',
    role.memberships > 0 && `member of ${role.memberships} role(s)`,
    role.owned > 0 && `owns ${role.owned} relation(s) in schema fa`,
  ].filter(Boolean)

  if (problems.length > 0) {
    throw new AppRoleError(`database role ${role.rolname} is over-privileged: ${problems.join(', ')}`)
  }
}

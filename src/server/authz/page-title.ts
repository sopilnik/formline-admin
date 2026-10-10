import 'server-only'
import { getTranslations } from 'next-intl/server'
import { requireSession } from '@/server/auth/sessions'
import { can, type Action } from '@/server/authz/matrix'

/** A page's tab title, or "Page not found" for a role the page answers not-found to, so the tab says what the page says. */
export async function titleFor(action: Action, title: string): Promise<string> {
  const session = await requireSession()
  if (can(session.role, action, session.workspaceKind)) return title
  return (await getTranslations('notFound'))('title')
}

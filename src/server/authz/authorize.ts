import { can, type Action, type WorkspaceKind } from '@/server/authz/matrix'
import type { Role } from '@/server/db/with-workspace'

export class ForbiddenError extends Error {
  readonly action: Action

  constructor(action: Action) {
    super(`not allowed: ${action}`)
    this.name = 'ForbiddenError'
    this.action = action
  }
}

export function authorize(ctx: { role: Role; workspaceKind: WorkspaceKind }, action: Action): void {
  if (!can(ctx.role, action, ctx.workspaceKind)) throw new ForbiddenError(action)
}

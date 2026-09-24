import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url(),
  ORIGIN_AUTH_SECRET: z.string().min(32).optional(),
  ORIGIN_AUTH_DISABLED: z.enum(['0', '1']).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return
  if (!env.ORIGIN_AUTH_SECRET) ctx.addIssue({ code: 'custom', path: ['ORIGIN_AUTH_SECRET'], message: 'required in production' })
  if (env.ORIGIN_AUTH_DISABLED === '1') ctx.addIssue({ code: 'custom', path: ['ORIGIN_AUTH_DISABLED'], message: 'not allowed in production' })
})

export type Env = z.infer<typeof schema>

/** Validates the environment; the server refuses to start on a bad one (instrumentation.ts). */
export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return schema.parse(source)
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { readEnv } = await import('@/server/env')
    readEnv()
  }
}

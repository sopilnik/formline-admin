// Liveness only: bunny's health check and the budget guard call it every few
// minutes, so it must never wake the database.
export const dynamic = 'force-dynamic'

export function GET(): Response {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
}

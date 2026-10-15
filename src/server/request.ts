import 'server-only'
import { headers } from 'next/headers'
import { isIP } from 'node:net'

export async function getRequestId(): Promise<string> {
  return (await headers()).get('x-request-id') ?? 'unknown'
}

/** The edge-set client IP; null in local development without the edge. */
export async function getClientIp(): Promise<string | null> {
  const ip = (await headers()).get('x-client-ip')

  return ip && isIP(ip) !== 0 ? ip : null
}

export async function getNonce(): Promise<string | undefined> {
  return (await headers()).get('x-nonce') ?? undefined
}

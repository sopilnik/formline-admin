import { redirect } from 'next/navigation'
import { getSession } from '@/server/auth/sessions'

export default async function Home() {
  const session = await getSession()
  redirect(session?.secondFactorVerified ? '/overview' : '/sign-in')
}

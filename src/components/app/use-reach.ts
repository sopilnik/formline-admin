'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useToast } from '@/components/ui/toast'
import { reach } from '@/lib/reach'

/**
 * Calls a server action from a control outside a form. A request that gets no answer gives null and says so in a toast,
 * instead of replacing the page with the error page (src/lib/reach.ts).
 */
export function useReach(): <T>(call: () => Promise<T>) => Promise<T | null> {
  const t = useTranslations('common')
  const toast = useToast()

  return async call => {
    const answer = await reach(call)

    if (answer === null) {
      toast.error(t('unreached'))
    }

    return answer
  }
}

/**
 * A refusal for the role, which no retry can change: the role was changed while the page was open (Switch user in
 * another tab, a demotion). The cause is said, and the page is drawn again for the role it has now.
 */
export function useRoleRefusal(): (message: string) => void {
  const toast = useToast()
  const router = useRouter()

  return message => {
    toast.error(message)
    router.refresh()
  }
}

import { getTranslations } from 'next-intl/server'
import type { LetterContent } from '@/lib/letters'

/** A letter's subject in the letter's own language, which may differ from the interface's. */
export async function letterSubject(content: LetterContent): Promise<string> {
  const t = await getTranslations({ locale: content.locale, namespace: 'letters' })
  return t(content.subject.key, content.subject.values)
}

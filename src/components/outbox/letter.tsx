import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { buttonVariants } from '@/components/ui/button'
import type { LetterContent } from '@/lib/letters'

/**
 * A letter as its recipient would read it: the greeting, the paragraphs and its one link — a real
 * address inside the panel — in the letter's own language, which may differ from the interface's.
 */
export async function LetterBody({ content }: { content: LetterContent }) {
  const t = await getTranslations({ locale: content.locale, namespace: 'letters' })
  return (
    <div lang={content.locale} className="flex max-w-prose flex-col gap-3 text-sm leading-6">
      {content.name ? <p>{t('greeting', { person: content.name })}</p> : null}
      {content.paragraphs.map(part => <p key={part.key}>{t(part.key, part.values)}</p>)}
      {content.action ? (
        <p className="py-1">
          <Link href={content.action.href} className={buttonVariants({ size: 'sm' })}>{t(content.action.key)}</Link>
        </p>
      ) : null}
      <p className="text-muted-foreground">{t('signOff')}</p>
    </div>
  )
}

import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

// A page of sign-in, setup or recovery that is not there: inside the layout's own main, which the root page's would nest.
export default async function AuthNotFound() {
  const t = await getTranslations('notFound')
  const nav = await getTranslations('nav')
  return (
    <div className="flex flex-col items-center gap-2 pt-10 text-center">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground">{t('description')}</p>
      <Link href="/overview" className="mt-2 text-[13px] font-medium text-primary hover:underline">{nav('overview')}</Link>
    </div>
  )
}

import { parseLocale } from '@/i18n/locale'
// The dictionaries live outside src; the page answers in proxy.ts, before any request handler runs.
// eslint-disable-next-line no-restricted-imports
import en from '../../messages/en.json'
// eslint-disable-next-line no-restricted-imports
import ru from '../../messages/ru.json'

/**
 * What every request but liveness gets while the database is unreachable (spec §13): one short page in the visitor's
 * language, without scripts or styles, so it needs no nonce.
 */
export function maintenancePage(cookieLocale: string | undefined): string {
  const locale = parseLocale(cookieLocale)
  const t = (locale === 'ru' ? ru : en).maintenance
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t.title}</title></head><body><main><h1>${t.heading}</h1><p>${t.body}</p></main></body></html>`
}

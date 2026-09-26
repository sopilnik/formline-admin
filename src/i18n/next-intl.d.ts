// messages/ lives outside src, so the @/ alias cannot reach it here.
// eslint-disable-next-line no-restricted-imports
import type en from '../../messages/en.json'
import type { Locale } from '@/i18n/locale'

// Message keys are checked at compile time against the English dictionary.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
    Messages: typeof en
  }
}

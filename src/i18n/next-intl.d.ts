import type { Locale } from '@/i18n/locale'
import type en from '@messages/en.json'

// Message keys are checked at compile time against the English dictionary.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
    Messages: typeof en
  }
}

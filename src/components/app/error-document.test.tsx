import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ErrorDocument } from '@/components/app/error-document'

describe('the root error page’s document', () => {
  it('carries the language, the fonts and the theme on <html>, and a title', () => {
    const html = renderToStaticMarkup(<ErrorDocument locale="ru" className="fonts dark" onRetry={() => {}} />)
    expect(html).toContain('<html lang="ru" class="fonts dark">')
    expect(html).toContain('<title>Что-то пошло не так · Formline Admin</title>')
    expect(html).toContain('Повторить')
  })
})

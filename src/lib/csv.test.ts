import { describe, expect, it } from 'vitest'
import { CSV_BOM, csvMoney, csvRecord, csvText } from '@/lib/csv'

describe('csv (spec §8.2, amendment 3)', () => {
  it('leaves plain text alone and quotes commas, quotes and line breaks', () => {
    expect(csvText('Maya Lindqvist')).toBe('Maya Lindqvist')
    expect(csvText('Анна Иванова')).toBe('Анна Иванова')
    expect(csvText('Smith, Jane')).toBe('"Smith, Jane"')
    expect(csvText('The "Loud" one')).toBe('"The ""Loud"" one"')
    expect(csvText('two\nlines')).toBe('"two\nlines"')
  })

  it('defuses cells a spreadsheet would run as a formula', () => {
    expect(csvText('=HYPERLINK("http://x.test","hi")')).toBe('"\'=HYPERLINK(""http://x.test"",""hi"")"')
    expect(csvText('+1 555 0100')).toBe("'+1 555 0100")
    expect(csvText('-2')).toBe("'-2")
    expect(csvText('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvText('\tcmd')).toBe("'\tcmd")
    expect(csvText('\rcmd')).toBe('"\'\rcmd"')
  })

  it('writes money with two decimals and records with CRLF', () => {
    expect(csvMoney(11800)).toBe('118.00')
    expect(csvMoney(5)).toBe('0.05')
    expect(csvMoney(0)).toBe('0.00')
    expect(csvRecord(['1412', 'Maya'])).toBe('1412,Maya\r\n')
    expect(CSV_BOM).toBe('\uFEFF')
  })
})

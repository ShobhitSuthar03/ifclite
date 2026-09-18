import { describe, expect, it } from 'vitest'
import { resolveCsvKeepIds, tableResultToXlsBytes } from '@/lib/csv-export'

describe('resolveCsvKeepIds', () => {
  it('keeps the full selection set for selected scope', () => {
    const keep = resolveCsvKeepIds('selected', null, new Set([9]), new Set([1, 2, 3]))
    expect(keep).toEqual(new Set([1, 2, 3]))
  })

  it('returns an empty set when nothing is selected', () => {
    expect(resolveCsvKeepIds('selected', null, new Set(), new Set())).toEqual(new Set())
  })
})

describe('tableResultToXlsBytes', () => {
  it('produces well-formed SpreadsheetML with a header row and typed cells', () => {
    const csv = 'expressId,ifcType,area\n1,IfcWall,12.5\n2,IfcSlab,8'
    const bytes = tableResultToXlsBytes({ fileName: 'model.xls', text: csv, rowCount: 2 }, ',', 'entities')
    const xml = new TextDecoder().decode(bytes)
    expect(xml).toContain('<?mso-application progid="Excel.Sheet"?>')
    expect(xml).toContain('ss:Name="entities"')
    expect(xml).toContain('<Data ss:Type="String">expressId</Data>')
    expect(xml).toContain('<Data ss:Type="String">IfcWall</Data>')
    expect(xml).toContain('<Data ss:Type="Number">12.5</Data>')
    // Balanced tags: every opening <Cell...> has a matching </Cell>.
    expect(xml.match(/<Cell/g)?.length).toBe(xml.match(/<\/Cell>/g)?.length)
    expect(xml.match(/<Row>/g)?.length).toBe(xml.match(/<\/Row>/g)?.length)
  })

  it('escapes XML-special characters and quoted CSV fields', () => {
    const csv = 'name,note\n"O\'Brien & Sons","<critical>"'
    const bytes = tableResultToXlsBytes({ fileName: 'model.xls', text: csv, rowCount: 1 }, ',', 'entities')
    const xml = new TextDecoder().decode(bytes)
    expect(xml).toContain('O\'Brien &amp; Sons')
    expect(xml).toContain('&lt;critical&gt;')
  })
})

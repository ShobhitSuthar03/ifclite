import type { ReportResult } from '@/lib/bim-sql/types'

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function xml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function display(result: ReportResult, rowIndex: number, columnKey: string): string {
  if (columnKey === 'label') return result.rows[rowIndex]?.label ?? ''
  const value = result.rows[rowIndex]?.values[columnKey]
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(3)
  return value == null ? '' : String(value)
}

function totals(result: ReportResult): Record<string, number> {
  const acc: Record<string, number> = {}
  for (const column of result.columns) {
    if (column.kind === 'text') continue
    acc[column.key] = result.rows.reduce((sum, row) => {
      const value = row.values[column.key]
      return sum + (typeof value === 'number' ? value : 0)
    }, 0)
  }
  return acc
}

export function reportToCsv(result: ReportResult): string {
  const header = result.columns.map((column) => csvCell(column.label)).join(',')
  const body = result.rows.map((_, index) =>
    result.columns.map((column) => csvCell(display(result, index, column.key))).join(','),
  )
  const sum = totals(result)
  const footer = result.columns
    .map((column, index) => {
      if (index === 0) return csvCell('Total')
      if (column.kind === 'text') return ''
      return csvCell(sum[column.key]?.toFixed(3) ?? '')
    })
    .join(',')
  return [header, ...body, footer].join('\n')
}

export function reportToJson(result: ReportResult): string {
  return JSON.stringify(
    {
      title: result.title,
      template: result.template,
      elementCount: result.elementCount,
      kpis: result.kpis,
      columns: result.columns,
      rows: result.rows,
      totals: totals(result),
    },
    null,
    2,
  )
}

export function reportToSpreadsheetXml(result: ReportResult): string {
  const sum = totals(result)
  const headerCells = result.columns
    .map((column) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xml(column.label)}</Data></Cell>`)
    .join('')
  const body = result.rows
    .map((_, index) => {
      const cells = result.columns
        .map((column) => {
          const raw = display(result, index, column.key)
          const numeric = column.kind !== 'text' && raw !== '' && Number.isFinite(Number(raw))
          return `<Cell${index === 0 ? ' ss:StyleID="Group"' : ''}><Data ss:Type="${numeric ? 'Number' : 'String'}">${xml(raw)}</Data></Cell>`
        })
        .join('')
      return `<Row>${cells}</Row>`
    })
    .join('\n')
  const footer = result.columns
    .map((column, index) => {
      if (index === 0) return `<Cell ss:StyleID="Total"><Data ss:Type="String">Total</Data></Cell>`
      if (column.kind === 'text') return `<Cell ss:StyleID="Total"><Data ss:Type="String"></Data></Cell>`
      return `<Cell ss:StyleID="Total"><Data ss:Type="Number">${sum[column.key] ?? 0}</Data></Cell>`
    })
    .join('')
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#1F4E79" ss:Pattern="Solid"/><Font ss:Color="#FFFFFF" ss:Bold="1"/></Style>
  <Style ss:ID="Group"><Interior ss:Color="#D6E3F0" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Total"><Font ss:Bold="1"/></Style>
 </Styles>
 <Worksheet ss:Name="${xml(result.template)}">
  <Table>
   <Row><Cell ss:MergeAcross="${Math.max(0, result.columns.length - 1)}" ss:StyleID="Header"><Data ss:Type="String">${xml(result.title)}</Data></Cell></Row>
   <Row>${headerCells}</Row>
   ${body}
   <Row>${footer}</Row>
  </Table>
 </Worksheet>
</Workbook>`
}

export function downloadTextFile(fileName: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

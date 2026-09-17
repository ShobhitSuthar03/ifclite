import { parseScheduleCsv } from '@/lib/schedule/import-csv'
import { isMppFile, parseMspdiXml } from '@/lib/schedule/import-mspdi'
import type { GanttModel } from '@/lib/schedule/types'

export function importScheduleFile(bytes: Uint8Array, fileName: string): GanttModel {
  if (isMppFile(fileName)) {
    throw new Error(`${fileName} is binary MS Project (.mpp). Save as XML (File → Save As → XML) and import that.`)
  }
  if (/\.xml$/i.test(fileName) || looksLikeXml(bytes)) return parseMspdiXml(bytes, fileName)
  return parseScheduleCsv(bytes, fileName)
}

function looksLikeXml(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8').decode(bytes.slice(0, 160)).trimStart()
  return head.startsWith('<?xml') || head.startsWith('<Project')
}

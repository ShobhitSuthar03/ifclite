import type { CostAssembly } from '@/lib/cost-assembly/types'
import { parseBoqCsv } from '@/lib/estimation/import-csv'
import { parseBoqXml } from '@/lib/estimation/import-xml'
import { decodeImportBytes, type BoqImportResult } from '@/lib/estimation/import-table'

export function importBoqFile(
  bytes: Uint8Array,
  fileName: string,
  assemblies?: Array<Pick<CostAssembly, 'id' | 'code'>>,
): BoqImportResult {
  if (/\.xml$/i.test(fileName) || looksLikeXml(bytes)) return parseBoqXml(bytes, fileName, assemblies)
  if (/\.csv$/i.test(fileName) || /\.txt$/i.test(fileName)) return parseBoqCsv(bytes, fileName, assemblies)
  try {
    return parseBoqXml(bytes, fileName, assemblies)
  } catch {
    return parseBoqCsv(bytes, fileName, assemblies)
  }
}

function looksLikeXml(bytes: Uint8Array): boolean {
  const head = decodeImportBytes(bytes.slice(0, 180)).trimStart()
  return head.startsWith('<?xml') || head.startsWith('<MainManager') || head.startsWith('<ElementItem')
}

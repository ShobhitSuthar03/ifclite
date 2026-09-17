import type { GanttModel, GanttSequence, GanttTask, ScheduleWarning } from '@/lib/schedule/types'
import { parseScheduleDate } from '@/lib/schedule/dates'
import { linkOutlineChildren } from '@/lib/schedule/view-tree'

export const SCHEDULE_IMPORT_MAX_BYTES = 20 * 1024 * 1024

const NAME_ALIASES = new Set(['name', 'task name', 'task', 'activity', 'activity name', 'title'])
const ID_ALIASES = new Set(['id', 'uid', 'unique id', 'task id', 'no', 'number'])
const LEVEL_ALIASES = new Set(['outline level', 'level', 'indent', 'indent level'])
const START_ALIASES = new Set(['start', 'start date', 'scheduled start', 'planned start', 'early start'])
const FINISH_ALIASES = new Set([
  'finish',
  'finish date',
  'end',
  'end date',
  'scheduled finish',
  'planned finish',
])
const DURATION_ALIASES = new Set(['duration', 'dur', 'days'])
const PRED_ALIASES = new Set(['predecessors', 'predecessor', 'depends', 'depends on'])
const PCT_ALIASES = new Set(['complete', 'percent complete', 'progress', 'pct complete'])
const MILESTONE_ALIASES = new Set(['milestone', 'is milestone'])
const COST_ALIASES = new Set(['cost', 'total cost', 'task cost'])

function headerKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function pickIndex(headers: string[], aliases: Set<string>): number {
  return headers.findIndex((header) => aliases.has(header))
}

function decodeBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  return new TextDecoder('utf-8').decode(bytes)
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else current += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') out.push(current), (current = '')
    else current += ch
  }
  out.push(current)
  return out.map((cell) => cell.trim())
}

function parseDurationDays(raw: string, warnings: ScheduleWarning[], line: number): number | null {
  const value = raw.trim()
  if (!value) return null
  if (/^-/.test(value)) {
    warnings.push({ code: 'unparsable-duration', message: `Line ${line}: negative duration “${value}”` })
    return null
  }
  const match = value.match(/^(\d+(?:[.,]\d+)?)\s*(d|day|days|edays|w|wk|wks|week|weeks|h|hr|hrs|hour|hours|mon|month|months)?$/i)
  if (!match) {
    warnings.push({ code: 'unparsable-duration', message: `Line ${line}: unrecognised duration “${value}”` })
    return null
  }
  const amount = Number(match[1].replace(',', '.'))
  const unit = (match[2] ?? 'd').toLowerCase()
  if (unit.startsWith('w')) return amount * 7
  if (unit.startsWith('h')) return amount / 24
  if (unit.startsWith('mon')) return amount * 30
  return amount
}

export function parsePredecessorToken(
  token: string,
  knownIds: Set<string>,
): { id: string; type: GanttSequence['type']; lag: string } | null {
  const raw = token.trim()
  if (!raw) return null
  const match = raw.match(/^(.*?)(?:\s*(FS|SS|FF|SF))?(\s*([+-].+))?$/i)
  if (!match) return null
  let id = match[1].trim()
  let type = (match[2]?.toUpperCase() as GanttSequence['type'] | undefined) ?? 'FS'
  const lag = match[3]?.trim() ?? ''
  if (knownIds.has(raw)) return { id: raw, type: 'FS', lag: '' }
  if (id && knownIds.has(id + type) && !match[2]) {
    return { id: id + type, type: 'FS', lag }
  }
  return { id, type, lag }
}

export function parseScheduleCsv(bytes: Uint8Array, fileName = 'schedule.csv'): GanttModel {
  const warnings: ScheduleWarning[] = []
  if (bytes.byteLength > SCHEDULE_IMPORT_MAX_BYTES) {
    throw new Error(`${fileName} is larger than 20 MB`)
  }
  const text = decodeBytes(bytes)
  const lines = text.split(/\r?\n/)
  const headerLine = lines.find((line) => line.trim()) ?? ''
  const headers = splitCsvLine(headerLine).map(headerKey)
  const nameIdx = pickIndex(headers, NAME_ALIASES)
  if (nameIdx < 0) throw new Error(`${fileName} needs a Name / Task Name column`)
  const idIdx = pickIndex(headers, ID_ALIASES)
  const levelIdx = pickIndex(headers, LEVEL_ALIASES)
  const startIdx = pickIndex(headers, START_ALIASES)
  const finishIdx = pickIndex(headers, FINISH_ALIASES)
  const durationIdx = pickIndex(headers, DURATION_ALIASES)
  const predIdx = pickIndex(headers, PRED_ALIASES)
  const pctIdx = pickIndex(headers, PCT_ALIASES)
  const milestoneIdx = pickIndex(headers, MILESTONE_ALIASES)
  const costIdx = pickIndex(headers, COST_ALIASES)

  const tasks: GanttTask[] = []
  const predecessorCells: Array<{ line: number; toId: string; raw: string }> = []
  let rowNumber = 0
  for (let i = 0; i < lines.length; i += 1) {
    if (i === 0 || !lines[i].trim()) continue
    rowNumber += 1
    const cells = splitCsvLine(lines[i])
    const name = cells[nameIdx] ?? ''
    if (!name) continue
    const statedId = idIdx >= 0 ? cells[idIdx] : ''
    const id = statedId || String(rowNumber)
    const start = startIdx >= 0 ? parseScheduleDate(cells[startIdx]) : null
    let finish = finishIdx >= 0 ? parseScheduleDate(cells[finishIdx]) : null
    if (!finish && start && durationIdx >= 0) {
      const days = parseDurationDays(cells[durationIdx] ?? '', warnings, i + 1)
      if (days != null) finish = new Date(start.getTime() + days * 86_400_000)
    }
    const milestoneRaw = milestoneIdx >= 0 ? (cells[milestoneIdx] ?? '').toLowerCase() : ''
    tasks.push({
      id,
      name,
      outlineLevel: Math.max(0, (levelIdx >= 0 ? Number(cells[levelIdx]) || 1 : 1) - 1),
      start,
      finish,
      isMilestone: milestoneRaw === 'yes' || milestoneRaw === 'true' || milestoneRaw === '1',
      completion: pctIdx >= 0 ? Number(String(cells[pctIdx]).replace('%', '').replace(',', '.')) || undefined : undefined,
      productExpressIds: [],
      childIds: [],
      cost: costIdx >= 0 ? Number(String(cells[costIdx] ?? '').replace(/[, ]/g, '')) || undefined : undefined,
    })
    if (predIdx >= 0 && cells[predIdx]) predecessorCells.push({ line: i + 1, toId: id, raw: cells[predIdx] })
  }
  const known = new Set(tasks.map((task) => task.id))
  const sequences: GanttSequence[] = []
  for (const cell of predecessorCells) {
    for (const token of cell.raw.split(/[;]/).flatMap((part) => {
      // comma is a separator unless it is a decimal in a lag
      return part.includes('FS') || part.includes('SS') || part.includes('FF') || part.includes('SF') || !part.includes(',')
        ? [part]
        : part.split(',')
    })) {
      const parsed = parsePredecessorToken(token, known)
      if (!parsed?.id) continue
      if (!known.has(parsed.id)) {
        warnings.push({
          code: 'unknown-predecessor',
          message: `Line ${cell.line}: predecessor “${parsed.id}” is not in the file`,
        })
        continue
      }
      sequences.push({ fromId: parsed.id, toId: cell.toId, type: parsed.type })
    }
  }
  return {
    source: 'import',
    name: fileName.replace(/\.(csv|txt)$/i, ''),
    tasks: linkOutlineChildren(tasks),
    sequences,
    warnings,
    hasSchedule: tasks.length > 0,
  }
}

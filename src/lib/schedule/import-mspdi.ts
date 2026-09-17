import { parseScheduleDate } from '@/lib/schedule/dates'
import { SCHEDULE_IMPORT_MAX_BYTES } from '@/lib/schedule/import-csv'
import { linkOutlineChildren } from '@/lib/schedule/view-tree'
import type { GanttModel, GanttSequence, GanttTask, ScheduleWarning } from '@/lib/schedule/types'

function localName(node: Element): string {
  return node.localName || node.tagName
}

function textOf(parent: Element, name: string): string {
  const child = [...parent.children].find((node) => localName(node) === name)
  return child?.textContent?.trim() ?? ''
}

function sequenceFromMspdi(type: string): GanttSequence['type'] {
  if (type === '0') return 'FF'
  if (type === '2') return 'SF'
  if (type === '3') return 'SS'
  return 'FS'
}

export function parseMspdiXml(bytes: Uint8Array, fileName = 'schedule.xml'): GanttModel {
  if (bytes.byteLength > SCHEDULE_IMPORT_MAX_BYTES) {
    throw new Error(`${fileName} is larger than 20 MB`)
  }
  const xml = new TextDecoder('utf-8').decode(bytes)
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error(`${fileName} is not valid XML`)
  const warnings: ScheduleWarning[] = []
  const project = [...doc.getElementsByTagName('*')].find((node) => localName(node) === 'Project') ?? doc.documentElement
  const projectName = textOf(project, 'Name') || fileName.replace(/\.xml$/i, '')
  const taskParent = [...project.getElementsByTagName('*')].find((node) => localName(node) === 'Tasks') ?? project
  const tasks: GanttTask[] = []
  const sequences: GanttSequence[] = []
  const statedIds = new Set<string>()
  const taskEls = [...taskParent.children].filter((node) => localName(node) === 'Task')
  taskEls.forEach((el, index) => {
    const uid = textOf(el, 'UID')
    const name = textOf(el, 'Name')
    if (!name && !uid) return
    const id = uid || `row-${index + 1}`
    if (statedIds.has(id)) {
      warnings.push({ code: 'duplicate-source-id', message: `Duplicate task id “${id}”` })
      return
    }
    statedIds.add(id)
    const outline = Number(textOf(el, 'OutlineLevel') || '1')
    tasks.push({
      id,
      name: name || `Task ${id}`,
      outlineLevel: Math.max(0, outline - 1),
      start: parseScheduleDate(textOf(el, 'Start')),
      finish: parseScheduleDate(textOf(el, 'Finish')),
      isMilestone: textOf(el, 'Milestone') === '1' || textOf(el, 'Milestone').toLowerCase() === 'true',
      completion: Number(textOf(el, 'PercentComplete') || textOf(el, 'PercentWorkComplete')) || undefined,
      productExpressIds: [],
      childIds: [],
      cost: Number(textOf(el, 'Cost')) || undefined,
    })
    for (const link of [...el.children].filter((node) => localName(node) === 'PredecessorLink')) {
      const pred = textOf(link, 'PredecessorUID')
      if (!pred) continue
      const lagFormat = textOf(link, 'LagFormat')
      if (['19', '20', '51', '52'].includes(lagFormat)) {
        warnings.push({
          code: 'percent-lag-dropped',
          message: `Task ${id}: percent lag (LagFormat ${lagFormat}) was dropped`,
        })
      }
      sequences.push({
        fromId: pred,
        toId: id,
        type: sequenceFromMspdi(textOf(link, 'Type')),
      })
    }
  })
  return {
    source: 'import',
    name: projectName,
    tasks: linkOutlineChildren(tasks),
    sequences: sequences.filter((seq) => statedIds.has(seq.fromId) && statedIds.has(seq.toId)),
    warnings,
    hasSchedule: tasks.length > 0,
  }
}

export function isMppFile(name: string): boolean {
  return /\.mpp$/i.test(name)
}

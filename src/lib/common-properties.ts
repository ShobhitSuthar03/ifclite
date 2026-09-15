import type { EntityData } from '@/lib/ifc-data'

export type CommonPropertyRow = {
  group: string
  name: string
  value: string
  mixed: boolean
  summed: boolean
}

function parseNumeric(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '')
  const match = trimmed.match(/^-?\d+(\.\d+)?(\s*[^\d].*)?$/)
  if (!match) return null
  const n = Number(match[0].match(/-?\d+(\.\d+)?/)?.[0])
  return Number.isFinite(n) ? n : null
}

function summarizeValues(
  values: string[],
  options?: { allowSum?: boolean },
): { value: string; mixed: boolean; summed: boolean } {
  const allowSum = options?.allowSum !== false
  const present = values.filter((item) => item && item !== '—')
  if (present.length === 0) return { value: '—', mixed: false, summed: false }
  const unique = new Set(present)
  if (unique.size === 1) return { value: present[0], mixed: false, summed: false }
  const numbers = present.map(parseNumeric)
  if (allowSum && numbers.every((item) => item != null)) {
    const sum = numbers.reduce((acc, item) => acc + (item ?? 0), 0)
    return { value: sum.toFixed(3), mixed: false, summed: true }
  }
  return { value: 'mixed', mixed: true, summed: false }
}

export function commonProperties(entities: EntityData[]): CommonPropertyRow[] {
  if (entities.length === 0) return []
  const rows: CommonPropertyRow[] = []
  const attributes: Array<{ name: string; pick: (item: EntityData) => string }> = [
    { name: 'Name', pick: (item) => item.name },
    { name: 'Description', pick: (item) => item.description },
    { name: 'ObjectType', pick: (item) => item.objectType },
    { name: 'Tag', pick: (item) => item.tag },
  ]
  for (const attr of attributes) {
    const summary = summarizeValues(entities.map(attr.pick), { allowSum: false })
    rows.push({ group: 'Attributes', name: attr.name, ...summary })
  }

  const psetKeys = new Map<string, { group: string; name: string }>()
  for (const entity of entities) {
    for (const set of entity.propertySets) {
      for (const property of set.properties) {
        psetKeys.set(`${set.name}\0${property.name}`, { group: set.name, name: property.name })
      }
    }
  }
  for (const [, meta] of psetKeys) {
    const values = entities.map((entity) => {
      const set = entity.propertySets.find((item) => item.name === meta.group)
      return set?.properties.find((item) => item.name === meta.name)?.value ?? '—'
    })
    if (values.every((item) => item === '—')) continue
    const shared = values.filter((item) => item !== '—').length
    if (shared < entities.length && shared < 2) continue
    rows.push({ group: meta.group, name: meta.name, ...summarizeValues(values) })
  }

  const qsetKeys = new Map<string, { group: string; name: string }>()
  for (const entity of entities) {
    for (const set of entity.quantitySets) {
      for (const quantity of set.quantities) {
        qsetKeys.set(`${set.name}\0${quantity.name}`, { group: set.name, name: quantity.name })
      }
    }
  }
  for (const [, meta] of qsetKeys) {
    const values = entities.map((entity) => {
      const set = entity.quantitySets.find((item) => item.name === meta.group)
      return set?.quantities.find((item) => item.name === meta.name)?.value ?? '—'
    })
    if (values.every((item) => item === '—')) continue
    rows.push({ group: meta.group, name: meta.name, ...summarizeValues(values) })
  }
  return rows
}

export function selectionTypeLabel(entities: EntityData[]): string {
  const types = [...new Set(entities.map((item) => item.ifcType))]
  if (types.length === 1) return types[0]
  return `${types.length} types`
}

import { all, run, type BimDatabase } from '@/lib/bim-sql/database'
import type { MutationPatch } from '@/lib/project-session'

const ATTR_COLUMNS: Record<string, string> = {
  name: 'name',
  description: 'description',
  objecttype: 'object_type',
  tag: 'tag',
}

const COST_KEYS = /^(costcode|cost_code|cost item|assemblycode|uniclass|classification|boq|boqitem)$/i
const BOQ_KEYS = /^(boq|boqitem|billitem|assemblycode)$/i
const PHASE_KEYS = /^(phase|constructionphase|4dphase|workphase)$/i
const STATUS_KEYS = /^(status|constructionstatus|4dstatus|taskstatus|progressstatus)$/i
const FIRE_KEYS = /^(firerating|fire_rating|resistancerating)$/i
const COST_VALUE_KEYS = /^(unitcost|totalcost|cost|estimatedcost)$/i
const TARGET_KEYS = /^(targetcost|budgetcost|target)$/i

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value !== 'string') return null
  const match = value.trim().replace(/,/g, '').match(/^-?\d+(\.\d+)?/)
  if (!match) return null
  const n = Number(match[0])
  return Number.isFinite(n) ? n : null
}

function propertyKey(name: string): string {
  return name.replace(/\s+/g, '')
}

function elementExists(db: BimDatabase, expressId: number): boolean {
  return all<{ express_id: number }>(db, 'SELECT express_id FROM elements WHERE express_id = ? LIMIT 1', [expressId])
    .length > 0
}

function denormalizeProperty(db: BimDatabase, expressId: number, name: string, value: string) {
  const key = propertyKey(name)
  if (COST_KEYS.test(key)) {
    run(db, 'UPDATE elements SET cost_code = ? WHERE express_id = ?', [value.trim() || 'Unassigned', expressId])
  }
  if (BOQ_KEYS.test(key)) {
    run(db, 'UPDATE elements SET boq_item = ? WHERE express_id = ?', [value.trim() || 'Unassigned', expressId])
  }
  if (PHASE_KEYS.test(key)) {
    run(db, 'UPDATE elements SET phase = ? WHERE express_id = ?', [value.trim() || 'Unassigned', expressId])
  }
  if (STATUS_KEYS.test(key)) {
    run(db, 'UPDATE elements SET status = ? WHERE express_id = ?', [value.trim() || 'Planned', expressId])
  }
  if (FIRE_KEYS.test(key)) {
    run(db, 'UPDATE elements SET fire_rating = ? WHERE express_id = ?', [value, expressId])
  }
  if (COST_VALUE_KEYS.test(key)) {
    const n = parseNumber(value)
    if (n != null) {
      const volume = Number(
        all<{ volume: number | null }>(db, 'SELECT volume FROM elements WHERE express_id = ? LIMIT 1', [expressId])[0]
          ?.volume ?? 0,
      )
      const totalCost = volume === 0 ? n : n * volume
      run(db, 'UPDATE elements SET unit_cost = ?, total_cost = ? WHERE express_id = ?', [n, totalCost, expressId])
    }
  }
  if (TARGET_KEYS.test(key)) {
    const n = parseNumber(value)
    if (n != null) {
      run(db, 'UPDATE elements SET target_cost = ? WHERE express_id = ?', [n, expressId])
    }
  }
}

export function applyMutationPatchToWarehouse(db: BimDatabase, patch: MutationPatch): boolean {
  if (!elementExists(db, patch.expressId)) return false
  if (patch.kind === 'attribute') {
    const column = ATTR_COLUMNS[patch.name.toLowerCase()]
    if (!column) return false
    run(db, `UPDATE elements SET ${column} = ? WHERE express_id = ?`, [patch.value, patch.expressId])
    return true
  }
  if (!patch.pset) return false
  const numeric = parseNumber(patch.value)
  const existing = all<{ id: number }>(
    db,
    'SELECT id FROM element_properties WHERE express_id = ? AND pset = ? AND name = ? LIMIT 1',
    [patch.expressId, patch.pset, patch.name],
  )
  if (existing.length > 0) {
    run(
      db,
      'UPDATE element_properties SET value = ?, numeric_value = ? WHERE express_id = ? AND pset = ? AND name = ?',
      [patch.value, numeric, patch.expressId, patch.pset, patch.name],
    )
  } else {
    run(
      db,
      'INSERT INTO element_properties (element_id, express_id, pset, name, value, numeric_value) VALUES (?, ?, ?, ?, ?, ?)',
      [patch.expressId, patch.expressId, patch.pset, patch.name, patch.value, numeric],
    )
  }
  denormalizeProperty(db, patch.expressId, patch.name, patch.value)
  return true
}

export function applyMutationPatchesToWarehouse(db: BimDatabase, patches: MutationPatch[]): number {
  let applied = 0
  for (const patch of patches) {
    if (applyMutationPatchToWarehouse(db, patch)) applied += 1
  }
  return applied
}

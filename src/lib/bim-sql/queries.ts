import type { Database } from 'sql.js'
import { all, run } from '@/lib/bim-sql/database'
import type {
  FilterOptions,
  GroupByField,
  MetricField,
  ReportFilter,
  ReportKpi,
  ReportResult,
  ReportRow,
  ReportTemplate,
  SqlValue,
} from '@/lib/bim-sql/types'

export const GROUP_BY_OPTIONS: Array<{ value: GroupByField; label: string; column: string }> = [
  { value: 'category', label: 'Category', column: 'category' },
  { value: 'storey', label: 'Level / storey', column: 'storey_name' },
  { value: 'material', label: 'Material', column: 'material' },
  { value: 'cost_code', label: 'Cost code', column: 'cost_code' },
  { value: 'phase', label: 'Phase', column: 'phase' },
  { value: 'ifc_type', label: 'IFC type', column: 'ifc_type' },
  { value: 'status', label: '4D status', column: 'status' },
]

export const METRIC_OPTIONS: Array<{ value: MetricField; label: string; expr: string }> = [
  { value: 'count', label: 'COUNT(GUID)', expr: 'COUNT(*)' },
  { value: 'volume', label: 'SUM(Volume)', expr: 'SUM(volume)' },
  { value: 'area', label: 'SUM(Area)', expr: 'SUM(area)' },
  { value: 'length', label: 'SUM(Length)', expr: 'SUM(length)' },
  { value: 'weight', label: 'SUM(Weight)', expr: 'SUM(weight)' },
  { value: 'cost', label: 'SUM(TotalCost)', expr: 'SUM(total_cost)' },
]

export const REPORT_TEMPLATES: Array<{ id: ReportTemplate; label: string; hint: string }> = [
  { id: 'qto', label: 'BOQ / QTO summary', hint: 'Volume, area, count, and weight by category, level, or material.' },
  { id: 'cost', label: 'Cost & budget (5D)', hint: 'Estimated vs target cost by cost code.' },
  { id: 'qa', label: 'Model QA / QC audit', hint: 'Elements missing cost codes, fire ratings, or spatial zones.' },
  { id: 'progress', label: 'Construction progress (4D)', hint: 'Planned vs actual status rates.' },
  { id: 'custom', label: 'Custom report', hint: 'Pick group-by fields, metrics, and filters.' },
]

const GROUP_COLUMN: Record<GroupByField, string> = Object.fromEntries(
  GROUP_BY_OPTIONS.map((item) => [item.value, item.column]),
) as Record<GroupByField, string>

export function applyScope(db: Database, expressIds: Set<number> | null) {
  run(db, 'DROP TABLE IF EXISTS temp.scope')
  run(db, 'CREATE TEMP TABLE scope (express_id INTEGER PRIMARY KEY)')
  if (expressIds == null) {
    run(db, 'INSERT INTO scope SELECT express_id FROM elements')
    return
  }
  const stmt = db.prepare('INSERT OR IGNORE INTO scope (express_id) VALUES (?)')
  run(db, 'BEGIN')
  try {
    for (const id of expressIds) stmt.run([id])
    run(db, 'COMMIT')
  } catch (error) {
    run(db, 'ROLLBACK')
    throw error
  } finally {
    stmt.free()
  }
}

function filterSql(filter: ReportFilter): { sql: string; params: SqlValue[] } {
  const parts = ['e.express_id IN (SELECT express_id FROM scope)']
  const params: SqlValue[] = []
  if (filter.storey) {
    parts.push('e.storey_name = ?')
    params.push(filter.storey)
  }
  if (filter.category) {
    parts.push('e.category = ?')
    params.push(filter.category)
  }
  if (filter.costCode) {
    parts.push('e.cost_code = ?')
    params.push(filter.costCode)
  }
  if (filter.phase) {
    parts.push('e.phase = ?')
    params.push(filter.phase)
  }
  if (filter.status) {
    parts.push('e.status = ?')
    params.push(filter.status)
  }
  return { sql: parts.join(' AND '), params }
}

function num(value: SqlValue): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value !== '') return Number(value) || 0
  return 0
}

function text(value: SqlValue): string {
  if (value == null) return 'Unassigned'
  return String(value)
}

export function loadFilterOptions(db: Database): FilterOptions {
  const distinct = (column: string) =>
    all<{ v: SqlValue }>(db, `SELECT DISTINCT ${column} AS v FROM elements WHERE ${column} IS NOT NULL AND ${column} != '' ORDER BY 1`).map(
      (row) => text(row.v),
    )
  return {
    storeys: distinct('storey_name'),
    categories: distinct('category'),
    costCodes: distinct('cost_code'),
    phases: distinct('phase'),
    statuses: distinct('status'),
  }
}

function scopedCte(filter: ReportFilter) {
  const where = filterSql(filter)
  return {
    sql: `WITH scoped AS (
      SELECT e.* FROM elements e
      WHERE ${where.sql}
    )`,
    params: where.params,
  }
}

function kpi(label: string, value: string, hint?: string, tone?: ReportKpi['tone']): ReportKpi {
  return { label, value, hint, tone }
}

function formatInt(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

function formatQty(value: number, digits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value)
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`
}

export function queryElementIds(
  db: Database,
  filter: ReportFilter,
  groupBy: GroupByField,
  groupKey: string,
): number[] {
  const column = GROUP_COLUMN[groupBy]
  const where = filterSql(filter)
  const rows = all<{ express_id: number }>(
    db,
    `SELECT e.express_id AS express_id FROM elements e WHERE ${where.sql} AND COALESCE(${column}, 'Unassigned') = ?`,
    [...where.params, groupKey],
  )
  return rows.map((row) => Number(row.express_id))
}

export function queryQaIds(db: Database, filter: ReportFilter, issue: string): number[] {
  const where = filterSql(filter)
  const extra =
    issue === 'cost'
      ? `(cost_code IS NULL OR cost_code = '' OR cost_code = 'Unassigned')`
      : issue === 'fire'
        ? `(fire_rating IS NULL OR fire_rating = '')`
        : `(storey_name IS NULL OR storey_name = '' OR storey_name = 'Unassigned')`
  return all<{ express_id: number }>(
    db,
    `SELECT e.express_id AS express_id FROM elements e WHERE ${where.sql} AND ${extra}`,
    where.params,
  ).map((row) => Number(row.express_id))
}

function groupedQto(db: Database, filter: ReportFilter, groupBy: GroupByField): ReportResult {
  const column = GROUP_COLUMN[groupBy]
  const cte = scopedCte(filter)
  const sql = `${cte.sql}
    SELECT
      COALESCE(${column}, 'Unassigned') AS group_key,
      COUNT(*) AS element_count,
      SUM(volume) AS volume,
      SUM(area) AS area,
      SUM(weight) AS weight,
      SUM(count) AS qty_count
    FROM scoped
    GROUP BY 1
    ORDER BY element_count DESC, group_key ASC`
  const rows = all<Record<string, SqlValue>>(db, sql, cte.params)
  const totals = { count: 0, volume: 0, area: 0, weight: 0 }
  for (const row of rows) {
    totals.count += num(row.element_count)
    totals.volume += num(row.volume)
    totals.area += num(row.area)
    totals.weight += num(row.weight)
  }
  return {
    template: 'qto',
    title: 'BOQ / quantity takeoff',
    groupBy,
    columns: [
      { key: 'label', label: GROUP_BY_OPTIONS.find((item) => item.value === groupBy)?.label ?? 'Group', kind: 'text' },
      { key: 'count', label: 'Count', kind: 'number' },
      { key: 'volume', label: 'Volume m³', kind: 'number' },
      { key: 'area', label: 'Area m²', kind: 'number' },
      { key: 'weight', label: 'Weight kg', kind: 'number' },
    ],
    kpis: [
      kpi('Elements', formatInt(totals.count)),
      kpi('Volume', `${formatQty(totals.volume)} m³`),
      kpi('Area', `${formatQty(totals.area)} m²`),
      kpi('Weight', `${formatQty(totals.weight, 0)} kg`),
    ],
    rows: rows.map((row) => ({
      key: text(row.group_key),
      label: text(row.group_key),
      values: {
        count: num(row.element_count),
        volume: num(row.volume),
        area: num(row.area),
        weight: num(row.weight),
      },
    })),
    elementCount: totals.count,
  }
}

function costReport(db: Database, filter: ReportFilter, groupBy: GroupByField): ReportResult {
  const column = GROUP_COLUMN[groupBy]
  const cte = scopedCte(filter)
  const sql = `${cte.sql}
    SELECT
      COALESCE(${column}, 'Unassigned') AS group_key,
      COUNT(*) AS element_count,
      SUM(volume) AS volume,
      SUM(total_cost) AS estimated,
      SUM(target_cost) AS target,
      CASE WHEN SUM(volume) > 0 THEN SUM(total_cost) / SUM(volume) ELSE AVG(unit_cost) END AS unit_cost
    FROM scoped
    GROUP BY 1
    ORDER BY estimated DESC`
  const rows = all<Record<string, SqlValue>>(db, sql, cte.params)
  const estimated = rows.reduce((sum, row) => sum + num(row.estimated), 0)
  const target = rows.reduce((sum, row) => sum + num(row.target), 0)
  return {
    template: 'cost',
    title: 'Cost & budget (5D)',
    groupBy,
    columns: [
      { key: 'label', label: GROUP_BY_OPTIONS.find((item) => item.value === groupBy)?.label ?? 'Group', kind: 'text' },
      { key: 'count', label: 'Count', kind: 'number' },
      { key: 'volume', label: 'Volume m³', kind: 'number' },
      { key: 'unit', label: 'Unit cost', kind: 'number' },
      { key: 'estimated', label: 'Estimated', kind: 'number' },
      { key: 'target', label: 'Target', kind: 'number' },
      { key: 'variance', label: 'Variance', kind: 'number' },
    ],
    kpis: [
      kpi('Estimated', formatMoney(estimated), 'Reference rates when the IFC has no cost pset'),
      kpi('Target', formatMoney(target), `${Math.round((1 - 0.92) * 100)}% below estimated unless TargetCost is set`),
      kpi('Variance', formatMoney(estimated - target), undefined, estimated > target ? 'warn' : 'ok'),
      kpi('Elements', formatInt(rows.reduce((sum, row) => sum + num(row.element_count), 0))),
    ],
    rows: rows.map((row) => {
      const est = num(row.estimated)
      const tgt = num(row.target)
      return {
        key: text(row.group_key),
        label: text(row.group_key),
        values: {
          count: num(row.element_count),
          volume: num(row.volume),
          unit: num(row.unit_cost),
          estimated: est,
          target: tgt,
          variance: est - tgt,
        },
      }
    }),
    elementCount: rows.reduce((sum, row) => sum + num(row.element_count), 0),
  }
}

function qaReport(db: Database, filter: ReportFilter): ReportResult {
  const cte = scopedCte(filter)
  const summary = all<Record<string, SqlValue>>(
    db,
    `${cte.sql}
     SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN cost_code IS NULL OR cost_code = '' OR cost_code = 'Unassigned' THEN 1 ELSE 0 END) AS missing_cost,
       SUM(CASE WHEN fire_rating IS NULL OR fire_rating = '' THEN 1 ELSE 0 END) AS missing_fire,
       SUM(CASE WHEN storey_name IS NULL OR storey_name = '' OR storey_name = 'Unassigned' THEN 1 ELSE 0 END) AS missing_storey
     FROM scoped`,
    cte.params,
  )[0]
  const total = num(summary?.total)
  const missingCost = num(summary?.missing_cost)
  const missingFire = num(summary?.missing_fire)
  const missingStorey = num(summary?.missing_storey)
  const pct = (part: number) => (total === 0 ? 0 : (100 * part) / total)
  const rows: ReportRow[] = [
    {
      key: 'cost',
      label: 'Unassigned cost code / BOQ',
      values: { count: missingCost, percent: pct(missingCost) },
    },
    {
      key: 'fire',
      label: 'Missing fire rating',
      values: { count: missingFire, percent: pct(missingFire) },
    },
    {
      key: 'storey',
      label: 'Unlinked spatial zone / storey',
      values: { count: missingStorey, percent: pct(missingStorey) },
    },
  ]
  return {
    template: 'qa',
    title: 'Model QA / QC audit',
    groupBy: 'category',
    columns: [
      { key: 'label', label: 'Issue', kind: 'text' },
      { key: 'count', label: 'Elements', kind: 'number' },
      { key: 'percent', label: '% of scoped set', kind: 'percent' },
    ],
    kpis: [
      kpi('Elements', formatInt(total)),
      kpi('Missing cost', formatPct(pct(missingCost)), undefined, missingCost ? 'warn' : 'ok'),
      kpi('Missing fire rating', formatPct(pct(missingFire)), undefined, missingFire ? 'warn' : 'ok'),
      kpi('Unlinked storey', formatPct(pct(missingStorey)), undefined, missingStorey ? 'warn' : 'ok'),
    ],
    rows,
    elementCount: total,
  }
}

function progressReport(db: Database, filter: ReportFilter): ReportResult {
  const cte = scopedCte(filter)
  const rows = all<Record<string, SqlValue>>(
    db,
    `${cte.sql}
     SELECT COALESCE(status, 'Unassigned') AS group_key, COUNT(*) AS element_count
     FROM scoped
     GROUP BY 1
     ORDER BY element_count DESC`,
    cte.params,
  )
  const total = rows.reduce((sum, row) => sum + num(row.element_count), 0)
  const complete = rows
    .filter((row) => /complete|actual|done|finished/i.test(text(row.group_key)))
    .reduce((sum, row) => sum + num(row.element_count), 0)
  return {
    template: 'progress',
    title: 'Construction progress (4D)',
    groupBy: 'status',
    columns: [
      { key: 'label', label: 'Status', kind: 'text' },
      { key: 'count', label: 'Elements', kind: 'number' },
      { key: 'percent', label: 'Share', kind: 'percent' },
    ],
    kpis: [
      kpi('Elements', formatInt(total)),
      kpi('Complete / actual', formatPct(total ? (100 * complete) / total : 0)),
      kpi('Statuses', formatInt(rows.length)),
    ],
    rows: rows.map((row) => ({
      key: text(row.group_key),
      label: text(row.group_key),
      values: {
        count: num(row.element_count),
        percent: total ? (100 * num(row.element_count)) / total : 0,
      },
    })),
    elementCount: total,
  }
}

function customReport(
  db: Database,
  filter: ReportFilter,
  groupBy: GroupByField,
  metrics: MetricField[],
): ReportResult {
  const column = GROUP_COLUMN[groupBy]
  const selected = metrics.length > 0 ? metrics : (['count', 'volume'] as MetricField[])
  const exprs = selected.map((metric) => {
    const option = METRIC_OPTIONS.find((item) => item.value === metric)!
    return `${option.expr} AS ${metric}`
  })
  const cte = scopedCte(filter)
  const sql = `${cte.sql}
    SELECT COALESCE(${column}, 'Unassigned') AS group_key, ${exprs.join(', ')}
    FROM scoped
    GROUP BY 1
    ORDER BY 2 DESC`
  const rows = all<Record<string, SqlValue>>(db, sql, cte.params)
  const totals = selected.reduce<Record<string, number>>((acc, metric) => {
    acc[metric] = rows.reduce((sum, row) => sum + num(row[metric]), 0)
    return acc
  }, {})
  return {
    template: 'custom',
    title: 'Custom report',
    groupBy,
    columns: [
      { key: 'label', label: GROUP_BY_OPTIONS.find((item) => item.value === groupBy)?.label ?? 'Group', kind: 'text' },
      ...selected.map((metric) => ({
        key: metric,
        label: METRIC_OPTIONS.find((item) => item.value === metric)?.label ?? metric,
        kind: 'number' as const,
      })),
    ],
    kpis: selected.map((metric) =>
      kpi(
        METRIC_OPTIONS.find((item) => item.value === metric)?.label ?? metric,
        metric === 'cost' ? formatMoney(totals[metric] ?? 0) : formatQty(totals[metric] ?? 0),
      ),
    ),
    rows: rows.map((row) => ({
      key: text(row.group_key),
      label: text(row.group_key),
      values: Object.fromEntries(selected.map((metric) => [metric, num(row[metric])])),
    })),
    elementCount: num(
      all<{ c: SqlValue }>(db, `${cte.sql} SELECT COUNT(*) AS c FROM scoped`, cte.params)[0]?.c,
    ),
  }
}

export function runReport(
  db: Database,
  template: ReportTemplate,
  filter: ReportFilter,
  groupBy: GroupByField,
  metrics: MetricField[],
  scopeIds: Set<number> | null,
): ReportResult {
  applyScope(db, scopeIds)
  if (template === 'qto') return groupedQto(db, filter, groupBy)
  if (template === 'cost') return costReport(db, filter, groupBy === 'category' ? 'cost_code' : groupBy)
  if (template === 'qa') return qaReport(db, filter)
  if (template === 'progress') return progressReport(db, filter)
  return customReport(db, filter, groupBy, metrics)
}

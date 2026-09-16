import {
  extractEntityAttributesOnDemand,
  extractMaterialsOnDemand,
  extractPropertiesOnDemand,
  extractQuantitiesOnDemand,
} from '@ifc-lite/parser'
import type { Database } from 'sql.js'
import { IfcTypeEnum, type IfcDataStore, type SpatialTreeNode } from '@/lib/ifc-data'
import { createIfcQuery } from '@/lib/ifc-query'
import { CATEGORY_UNIT_RATES, CONCRETE_DENSITY_KG_M3, TARGET_COST_FACTOR } from '@/lib/bim-sql/schema'
import { all, run } from '@/lib/bim-sql/database'
import type { ElementRecord } from '@/lib/bim-sql/types'
import type { QuantityResult } from '@/lib/geometry-qto'

const SKIP_TYPE =
  /^(IfcRel|IfcProperty|IfcQuantity|IfcMaterial|IfcOwner|IfcPerson|IfcOrganization|IfcApplication|IfcCartesian|IfcDirection|IfcAxis|IfcLocalPlacement|IfcObjectPlacement|IfcGridPlacement|IfcShape|IfcFace|IfcPoly|IfcColour|IfcPresentation|IfcGeometric|IfcSIUnit|IfcUnitAssignment|IfcConversion|IfcMeasure|IfcDimensional|IfcProject$|IfcSite$|IfcBuilding$|IfcBuildingStorey|IfcProductDefinitionShape|IfcStyled|IfcSurfaceStyle|IfcColourRgb|IfcIndexed|IfcTriangulated|IfcTessellated|IfcBoolean|IfcExtruded|IfcRevolved|IfcSwept|IfcMappedItem|IfcRepresentation|IfcProfile|IfcClosedShell|IfcOpenShell|IfcConnectedFace|IfcAdvancedBrep|IfcVertex|IfcEdge|IfcLoop|IfcSolid|IfcCsg|IfcHalfSpace|IfcBoxedHalf|IfcSectioned|IfcArbitrary|IfcCompositeCurve|IfcTrimmed|IfcBSpline|IfcCircle$|IfcCircleProfile|IfcLine$|IfcPlane$|IfcPoint|IfcVector|IfcFillArea|IfcTexture|IfcImage|IfcBlob|IfcPixel|IfcCurveStyle|IfcDraughting|IfcTopology)/i

const COST_KEYS = /^(costcode|cost_code|cost item|assemblycode|uniclass|classification|boq|boqitem)$/i
const BOQ_KEYS = /^(boq|boqitem|billitem|assemblycode)$/i
const PHASE_KEYS = /^(phase|constructionphase|4dphase|workphase)$/i
const STATUS_KEYS = /^(status|constructionstatus|4dstatus|taskstatus|progressstatus)$/i
const FIRE_KEYS = /^(firerating|fire_rating|resistancerating)$/i
const COST_VALUE_KEYS = /^(unitcost|totalcost|cost|estimatedcost)$/i
const TARGET_KEYS = /^(targetcost|budgetcost|target)$/i

export function isWarehouseElementType(ifcType: string): boolean {
  if (!ifcType || SKIP_TYPE.test(ifcType)) return false
  if (ifcType.startsWith('IfcRel')) return false
  return true
}

function categoryOf(ifcType: string): string {
  return ifcType.replace(/StandardCase$/, '')
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value !== 'string') return null
  const match = value.trim().replace(/,/g, '').match(/^-?\d+(\.\d+)?/)
  if (!match) return null
  const n = Number(match[0])
  return Number.isFinite(n) ? n : null
}

function stringify(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  return String(value)
}

function pickByName(
  props: Array<{ name: string; value: unknown }>,
  pattern: RegExp,
): string {
  const hit = props.find((item) => pattern.test(item.name.replace(/\s+/g, '')))
  return hit ? stringify(hit.value) : ''
}

function qtyByName(
  quantities: Array<{ name: string; value: number }>,
  pattern: RegExp,
): number {
  const hit = quantities.find((item) => pattern.test(item.name.replace(/\s+/g, '')))
  return hit?.value ?? 0
}

export const WAREHOUSE_INGEST_CHUNK = 32

export function listWarehouseElementIds(store: IfcDataStore, productIds?: number[]): number[] {
  const ids: number[] = []
  const seen = new Set<number>()
  const source = productIds ?? flattenEntityIds(store)
  for (const expressId of source) {
    if (seen.has(expressId)) continue
    seen.add(expressId)
    if (!productIds) {
      const ifcType = store.entities.getTypeName(expressId) || 'IfcProduct'
      if (!isWarehouseElementType(ifcType)) continue
    }
    ids.push(expressId)
  }
  return ids
}

function flattenEntityIds(store: IfcDataStore): number[] {
  const ids: number[] = []
  const seen = new Set<number>()
  for (const group of store.entityIndex.byType.values()) {
    for (const expressId of group) {
      if (seen.has(expressId)) continue
      seen.add(expressId)
      ids.push(expressId)
    }
  }
  return ids
}

function collectElementRecord(
  store: IfcDataStore,
  expressId: number,
  query: ReturnType<typeof createIfcQuery>,
): ElementRecord | null {
  const ifcType = store.entities.getTypeName(expressId) || 'IfcProduct'
  if (!isWarehouseElementType(ifcType)) return null
  try {
    const attrs = extractEntityAttributesOnDemand(store, expressId)
    const psets = extractPropertiesOnDemand(store, expressId)
    const qsets = extractQuantitiesOnDemand(store, expressId)
    const materialInfo = extractMaterialsOnDemand(store, expressId)
    const flatProps = psets.flatMap((set) =>
      set.properties.map((property) => ({ pset: set.name, name: property.name, value: property.value })),
    )
    const flatQtys = qsets.flatMap((set) =>
      set.quantities.map((quantity) => ({
        qset: set.name,
        name: quantity.name,
        value: typeof quantity.value === 'number' ? quantity.value : Number(quantity.value) || 0,
      })),
    )

    const volume = qtyByName(flatQtys, /^(netvolume|grossvolume|volume)$/i)
    const area = qtyByName(flatQtys, /^(netsidearea|grossarea|netarea|area)$/i)
    const length = qtyByName(flatQtys, /^(length|netlength)$/i)
    const width = qtyByName(flatQtys, /^(width|thickness)$/i)
    const height = qtyByName(flatQtys, /^(height)$/i)
    const weight = qtyByName(flatQtys, /^(weight|netweight|grossweight)$/i) || volume * CONCRETE_DENSITY_KG_M3

    const costProp = pickByName(flatProps, COST_VALUE_KEYS)
    const unitFromProp = parseNumber(costProp)
    const category = categoryOf(ifcType)
    const unitCost = unitFromProp ?? CATEGORY_UNIT_RATES[ifcType] ?? CATEGORY_UNIT_RATES[category] ?? 150
    const totalCost = unitFromProp != null && volume === 0 ? unitFromProp : unitCost * (volume || 1)
    const targetRaw = parseNumber(pickByName(flatProps, TARGET_KEYS))
    const targetCost = targetRaw ?? totalCost * TARGET_COST_FACTOR

    const storey = (() => {
      try {
        return query.entity(expressId).storey()
      } catch {
        return null
      }
    })()
    const material =
      materialInfo?.name ||
      materialInfo?.layers?.[0]?.materialName ||
      materialInfo?.layers?.[0]?.name ||
      materialInfo?.materials?.[0]?.name ||
      ''

    return {
      expressId,
      globalId: attrs.globalId || '',
      ifcType,
      category,
      name: attrs.name || store.entities.getName(expressId) || '',
      description: attrs.description || '',
      objectType: attrs.objectType || '',
      tag: attrs.tag || '',
      storeyId: storey?.expressId ?? null,
      storeyName: storey?.name || 'Unassigned',
      zoneName: '',
      material: material || 'Unassigned',
      costCode: pickByName(flatProps, COST_KEYS) || 'Unassigned',
      boqItem: pickByName(flatProps, BOQ_KEYS) || pickByName(flatProps, COST_KEYS) || 'Unassigned',
      phase: pickByName(flatProps, PHASE_KEYS) || 'Unassigned',
      status: pickByName(flatProps, STATUS_KEYS) || 'Planned',
      volume,
      area,
      length,
      width,
      height,
      weight,
      unitCost,
      totalCost,
      targetCost,
      fireRating: pickByName(flatProps, FIRE_KEYS),
      properties: flatProps.map((item) => ({
        pset: item.pset,
        name: item.name,
        value: stringify(item.value),
        numeric: parseNumber(item.value),
      })),
      quantities: flatQtys.map((item) => ({
        qset: item.qset,
        name: item.name,
        value: item.value,
        unit: '',
      })),
    }
  } catch {
    return null
  }
}

export function collectElementRecordsRange(
  store: IfcDataStore,
  ids: number[],
  start: number,
  end: number,
  query: ReturnType<typeof createIfcQuery>,
): ElementRecord[] {
  const rows: ElementRecord[] = []
  const last = Math.min(end, ids.length)
  for (let index = start; index < last; index += 1) {
    const row = collectElementRecord(store, ids[index], query)
    if (row) rows.push(row)
  }
  return rows
}

export function collectElementRecords(store: IfcDataStore): ElementRecord[] {
  const query = createIfcQuery(store)
  return collectElementRecordsRange(store, listWarehouseElementIds(store), 0, Number.POSITIVE_INFINITY, query)
}

export function startWarehouseIngest(
  db: Database,
  spatialRoot: SpatialTreeNode | null,
  fileName: string,
  versionId: string,
): number {
  run(db, 'INSERT INTO models (name, version_id, loaded_at) VALUES (?, ?, ?)', [
    fileName,
    versionId,
    new Date().toISOString(),
  ])
  const modelId = Number(all<{ id: number }>(db, 'SELECT last_insert_rowid() AS id')[0]?.id ?? 1)
  if (spatialRoot) insertSpatial(db, modelId, spatialRoot, null)
  return modelId
}

function insertSpatial(db: Database, modelId: number, node: SpatialTreeNode, parent: number | null) {
  run(
    db,
    `INSERT INTO spatial_locations (model_id, express_id, name, type, elevation, parent_express_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [modelId, node.expressId, node.name, IfcTypeEnum[node.type] ?? String(node.type), node.elevation ?? null, parent],
  )
  for (const child of node.children) insertSpatial(db, modelId, child, node.expressId)
}

export function insertElementRecords(db: Database, modelId: number, records: ElementRecord[]) {
  if (records.length === 0) return
  const elementStmt = db.prepare(
    `INSERT INTO elements (
      id, model_id, express_id, global_id, ifc_type, category, name, description, object_type, tag,
      storey_id, storey_name, zone_name, material, cost_code, boq_item, phase, status,
      volume, area, length, width, height, weight, count, unit_cost, total_cost, target_cost, fire_rating
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const propStmt = db.prepare(
    `INSERT INTO element_properties (element_id, express_id, pset, name, value, numeric_value)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const qtyStmt = db.prepare(
    `INSERT INTO quantities (element_id, express_id, qset, name, value, unit)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )

  run(db, 'BEGIN')
  try {
    for (const row of records) {
      elementStmt.run([
        row.expressId,
        modelId,
        row.expressId,
        row.globalId,
        row.ifcType,
        row.category,
        row.name,
        row.description,
        row.objectType,
        row.tag,
        row.storeyId,
        row.storeyName,
        row.zoneName,
        row.material,
        row.costCode,
        row.boqItem,
        row.phase,
        row.status,
        row.volume,
        row.area,
        row.length,
        row.width,
        row.height,
        row.weight,
        1,
        row.unitCost,
        row.totalCost,
        row.targetCost,
        row.fireRating,
      ])
      const elementId = row.expressId
      for (const property of row.properties) {
        propStmt.run([elementId, row.expressId, property.pset, property.name, property.value, property.numeric])
      }
      for (const quantity of row.quantities) {
        qtyStmt.run([elementId, row.expressId, quantity.qset, quantity.name, quantity.value, quantity.unit])
      }
    }
    run(db, 'COMMIT')
  } catch (error) {
    run(db, 'ROLLBACK')
    throw error
  } finally {
    elementStmt.free()
    propStmt.free()
    qtyStmt.free()
  }
}

export function ingestWarehouse(
  db: Database,
  store: IfcDataStore,
  spatialRoot: SpatialTreeNode | null,
  fileName: string,
  versionId: string,
) {
  const modelId = startWarehouseIngest(db, spatialRoot, fileName, versionId)
  insertElementRecords(db, modelId, collectElementRecords(store))
  return modelId
}

export function applyGeometryQuantities(db: Database, result: QuantityResult) {
  const stmt = db.prepare(
    `UPDATE elements
     SET volume = CASE WHEN volume = 0 THEN ? ELSE volume END,
         area = CASE WHEN area = 0 THEN ? ELSE area END,
         length = CASE WHEN length = 0 THEN ? ELSE length END,
         width = CASE WHEN width = 0 THEN ? ELSE width END,
         height = CASE WHEN height = 0 THEN ? ELSE height END,
         weight = CASE WHEN weight = 0 THEN ? ELSE weight END,
         total_cost = unit_cost * CASE WHEN volume = 0 THEN ? ELSE volume END,
         target_cost = unit_cost * CASE WHEN volume = 0 THEN ? ELSE volume END * ${TARGET_COST_FACTOR}
     WHERE express_id = ?`,
  )
  run(db, 'BEGIN')
  try {
    for (const element of result.elements) {
      const m = element.metrics
      const volume = m.VOLUME
      stmt.run([
        volume,
        m.GROSSAREA,
        m.LENGTH,
        m.WIDTH,
        m.HEIGHT,
        volume * CONCRETE_DENSITY_KG_M3,
        volume,
        volume,
        element.expressId,
      ])
    }
    run(db, 'COMMIT')
  } catch (error) {
    run(db, 'ROLLBACK')
    throw error
  } finally {
    stmt.free()
  }
}

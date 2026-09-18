import type { AreaMetricKey } from '@/lib/geometry-qto'

export const TAKEOFF_QTY_FIELDS: Array<{ field: AreaMetricKey; label: string; unit: string }> = [
  { field: 'VOLUME', label: 'Volume', unit: 'm³' },
  { field: 'LATERALAREA', label: 'Lateral area', unit: 'm²' },
  { field: 'GROSSAREA', label: 'Gross area', unit: 'm²' },
  { field: 'AREAMAX', label: 'Max area', unit: 'm²' },
  { field: 'UNDERAREA', label: 'Soffit area', unit: 'm²' },
  { field: 'TOPAREA', label: 'Top area', unit: 'm²' },
  { field: 'FOOTPRINTAREA', label: 'Footprint', unit: 'm²' },
  { field: 'COVEREDAREA', label: 'Covered area', unit: 'm²' },
  { field: 'LENGTH', label: 'Length', unit: 'm' },
  { field: 'WIDTH', label: 'Width', unit: 'm' },
  { field: 'HEIGHT', label: 'Height', unit: 'm' },
  { field: 'COUNT', label: 'Count', unit: 'nr' },
]

const TAKEOFF_FIELD_SET = new Set(TAKEOFF_QTY_FIELDS.map((item) => item.field))

export function isTakeoffField(value: string): value is AreaMetricKey {
  return TAKEOFF_FIELD_SET.has(value as AreaMetricKey)
}

export function takeoffFieldMeta(field: AreaMetricKey): { field: AreaMetricKey; label: string; unit: string } {
  return TAKEOFF_QTY_FIELDS.find((item) => item.field === field) ?? { field, label: String(field), unit: '' }
}

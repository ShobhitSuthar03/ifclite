import type { PropertyCatalogSet } from '@/lib/bim-sql'
import type { AssemblyParameter } from '@/lib/cost-assembly/types'
import type { AreaMetricKey } from '@/lib/geometry-qto'
import { propertyRefKey, type PropertyRef } from '@/lib/property-tree'
import { isTakeoffField, TAKEOFF_QTY_FIELDS } from '@/lib/estimation/takeoff-fields'

/**
 * How a Parameter's value should be obtained across the one-or-more objects a BOQ line/assembly
 * link covers. iTWO exports one blended ratio per line (e.g. Bekistingsratio for a whole group
 * of walls); that's only correct when every object in the group happens to share that ratio.
 * 'manual' keeps the flat typed-in value (right for genuinely project-wide constants like
 * concrete grade or pump count). 'takeoff'/'ifc' instead measure the real per-object quantity
 * from geometry or an IFC property, summed or averaged across whichever objects are in scope -
 * so a formwork-area parameter reflects each wall's own area, not one number applied to all of
 * them.
 */
export type ParamCombine = 'sum' | 'average'

export type ParamBinding =
  | { mode: 'manual' }
  | { mode: 'takeoff'; field: AreaMetricKey; combine: ParamCombine }
  | { mode: 'ifc'; property: PropertyRef; combine: ParamCombine }

export function paramBindingKey(assemblyId: string, code: string): string {
  return `${assemblyId}::param::${code}`
}

/** "_LVMenge" already means "the real bound quantity" - it's measured elsewhere, not via a
 *  ParamBinding, so it's excluded from suggestion/UI here. */
export function isLiveQuantityParameter(parameter: Pick<AssemblyParameter, 'value'>): boolean {
  return (parameter.value ?? '').trim() === '_LVMenge'
}

function normalizeToken(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** Terms worth matching against the model's own property/quantity names: the parameter's code
 *  (a deliberate, usually-distinctive identifier, e.g. "Betonsterkte", "WAP") plus longer words
 *  pulled out of its (often "Dutch | English") description. */
function candidateTerms(parameter: AssemblyParameter): { code: string; words: string[] } {
  const code = normalizeToken(parameter.code)
  const words = new Set<string>()
  for (const part of parameter.description.split('|')) {
    for (const raw of part.split(/[^a-zA-Z0-9]+/)) {
      if (raw.trim().length >= 5) words.add(normalizeToken(raw))
    }
  }
  return { code, words: [...words].filter(Boolean) }
}

/** Looks for a real property/quantity in the model that plausibly IS this parameter (e.g. an
 *  actual "StrengthClass"/"Betonsterkte" value someone modeled), so we bind to the model's own
 *  authored data instead of a geometry metric or a typed-in guess. Conservative on purpose: a
 *  parameter suggestion is easy to overrule from the UI, but a wrong auto-bind that looks right
 *  is easy to miss. */
function findMatchingProperty(parameter: AssemblyParameter, catalog: PropertyCatalogSet[]): PropertyRef | null {
  const { code, words } = candidateTerms(parameter)
  if (!code && words.length === 0) return null
  for (const group of catalog) {
    if (group.kind !== 'property' && group.kind !== 'quantity') continue
    for (const name of group.names) {
      const normalizedName = normalizeToken(name)
      if (!normalizedName) continue
      const codeMatch = code.length >= 3 && (normalizedName === code || normalizedName.includes(code) || code.includes(normalizedName))
      const wordMatch = words.some((word) => normalizedName.includes(word))
      if (codeMatch || wordMatch) return { set: group.set, name, kind: group.kind }
    }
  }
  return null
}

/**
 * Where a parameter's value should come from, by default: a matching IFC property/quantity
 * actually present on the linked objects (real, authored model data - safe to trust
 * automatically), or 'manual' otherwise. A geometry takeoff metric is a real option too (and the
 * dropdown offers every metric), but it's a guess about which metric corresponds to this
 * parameter, and a guessed metric that isn't actually computed for this element type would
 * silently resolve to 0 and zero out every cost line under it. So it's never auto-applied - the
 * user picks it deliberately from the binding dropdown when they want it. Until then, a manual
 * parameter with nothing typed in resolves to 1 (see makeParameterResolver), not a silent 0.
 */
export function suggestParamBinding(parameter: AssemblyParameter, catalog: PropertyCatalogSet[] = []): ParamBinding {
  if (isLiveQuantityParameter(parameter)) return { mode: 'manual' }
  const matchedProperty = findMatchingProperty(parameter, catalog)
  if (matchedProperty) return { mode: 'ifc', property: matchedProperty, combine: 'sum' }
  return { mode: 'manual' }
}

export function resolveParamBinding(
  parameter: AssemblyParameter,
  stored: ParamBinding | undefined,
  catalog: PropertyCatalogSet[] = [],
): ParamBinding {
  return stored ?? suggestParamBinding(parameter, catalog)
}

export function paramSourceValue(binding: ParamBinding): string {
  if (binding.mode === 'manual') return 'manual'
  if (binding.mode === 'takeoff') return `takeoff:${binding.field}`
  return `ifc:${propertyRefKey(binding.property)}`
}

export function parseParamSourceValue(value: string): { mode: 'manual' } | { mode: 'takeoff'; field: AreaMetricKey } | { mode: 'ifc'; property: PropertyRef } | null {
  if (value === 'manual') return { mode: 'manual' }
  if (value.startsWith('takeoff:')) {
    const field = value.slice('takeoff:'.length)
    return isTakeoffField(field) ? { mode: 'takeoff', field } : null
  }
  if (value.startsWith('ifc:')) {
    const property = parsePropertyKeySuffix(value.slice('ifc:'.length))
    return property ? { mode: 'ifc', property } : null
  }
  return null
}

function parsePropertyKeySuffix(value: string): PropertyRef | null {
  const colon = value.indexOf(':')
  if (colon <= 0) return null
  const kind = value.slice(0, colon)
  const rest = value.slice(colon + 1)
  const dot = rest.lastIndexOf('.')
  if (dot <= 0) return null
  if (kind !== 'property' && kind !== 'quantity' && kind !== 'attribute') return null
  const set = rest.slice(0, dot)
  const name = rest.slice(dot + 1).trim()
  if (!name) return null
  return { set, name, kind: kind as PropertyRef['kind'] }
}

export function withCombine(
  source: { mode: 'manual' } | { mode: 'takeoff'; field: AreaMetricKey } | { mode: 'ifc'; property: PropertyRef },
  combine: ParamCombine,
): ParamBinding {
  if (source.mode === 'manual') return source
  return { ...source, combine } as ParamBinding
}

/** Measures a parameter's real value across `ids` (sum, or average per object), or returns
 *  null for 'manual' bindings so the caller falls back to the typed override/catalog default. */
export function measuredParamValue(
  binding: ParamBinding,
  ids: number[],
  measureTakeoffFn: (ids: number[], field: AreaMetricKey) => number,
  measureIfcFn?: (ids: number[], property: PropertyRef) => number,
): number | null {
  if (binding.mode === 'manual') return null
  const count = Math.max(ids.length, 1)
  const total = binding.mode === 'takeoff' ? measureTakeoffFn(ids, binding.field) : (measureIfcFn?.(ids, binding.property) ?? 0)
  return binding.combine === 'average' ? total / count : total
}

/** Builds the `measured` map makeParameterResolver expects: one entry per parameter that has a
 *  non-manual binding, with its real value for the given object ids. */
export function buildMeasuredParams(
  parameters: AssemblyParameter[],
  bindings: Record<string, ParamBinding>,
  assemblyId: string,
  ids: number[],
  measureTakeoffFn: (ids: number[], field: AreaMetricKey) => number,
  measureIfcFn?: (ids: number[], property: PropertyRef) => number,
  catalog: PropertyCatalogSet[] = [],
): Map<string, number> {
  const measured = new Map<string, number>()
  for (const parameter of parameters) {
    const binding = resolveParamBinding(parameter, bindings[paramBindingKey(assemblyId, parameter.code)], catalog)
    const value = measuredParamValue(binding, ids, measureTakeoffFn, measureIfcFn)
    if (value != null) measured.set(parameter.code, value)
  }
  return measured
}

/** Returns a new bindings map with `code` bound to `binding` for the given assembly. */
export function setParamBinding(
  bindings: Record<string, ParamBinding>,
  assemblyId: string,
  code: string,
  binding: ParamBinding,
): Record<string, ParamBinding> {
  return { ...bindings, [paramBindingKey(assemblyId, code)]: binding }
}

export function parseParamBindings(value: unknown): Record<string, ParamBinding> {
  const out: Record<string, ParamBinding> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!key) continue
    const binding = parseParamBinding(item)
    if (binding) out[key] = binding
  }
  return out
}

function parseParamBinding(value: unknown): ParamBinding | null {
  if (!value || typeof value !== 'object') return null
  const row = value as { mode?: unknown; field?: unknown; property?: unknown; combine?: unknown }
  if (row.mode === 'manual') return { mode: 'manual' }
  const combine = row.combine === 'average' ? 'average' : 'sum'
  if (row.mode === 'takeoff' && typeof row.field === 'string' && isTakeoffField(row.field)) {
    return { mode: 'takeoff', field: row.field, combine }
  }
  if (row.mode === 'ifc' && row.property && typeof row.property === 'object') {
    const property = row.property as { set?: unknown; name?: unknown; kind?: unknown }
    const name = typeof property.name === 'string' ? property.name.trim() : ''
    const set = typeof property.set === 'string' ? property.set : ''
    if (name && (property.kind === 'property' || property.kind === 'quantity' || property.kind === 'attribute')) {
      return { mode: 'ifc', property: { set, name, kind: property.kind }, combine }
    }
  }
  return null
}

export { TAKEOFF_QTY_FIELDS }

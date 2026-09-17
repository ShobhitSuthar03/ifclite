import { evaluateFormula, type FormulaResolver } from '@/lib/cost-assembly/formula'
import type { AssemblyParameter, CostAssembly } from '@/lib/cost-assembly/types'

/** The catalog's placeholder for "the real quantity of the linked BOQ/element (m3, m2, count...)". */
const LIVE_QUANTITY_TOKEN = '_LVMenge'

/** User overrides are stored as `${assemblyId}::${parameterCode}` -> raw value string, the same
 *  shape as qty bindings and excluded lines, so they can live next to those in a BoqDoc. */
export function parameterOverrideKey(assemblyId: string, code: string): string {
  return `${assemblyId}::${code}`
}

export function parameterOverrideValue(
  overrides: Record<string, string> | undefined,
  assemblyId: string,
  code: string,
): string | undefined {
  const raw = overrides?.[parameterOverrideKey(assemblyId, code)]
  return raw != null && raw.trim() !== '' ? raw : undefined
}

/**
 * Builds a resolver that answers "what is the current numeric value of parameter X" for an
 * assembly, given optional user overrides, the live quantity bound to the current BOQ
 * line/element (substituted for the `_LVMenge` placeholder), and optionally a set of
 * already-measured real values (from a takeoff/IFC ParamBinding) that take priority over both
 * the override and the catalog default - see `measuredParamValue` in param-bind.ts. Parameter
 * formulas may reference other parameters by code; those are resolved lazily and memoized, with
 * a cycle guard so a bad catalog can't recurse forever.
 */
export function makeParameterResolver(
  assembly: Pick<CostAssembly, 'id' | 'parameters'>,
  overrides: Record<string, string> | undefined,
  liveQuantity: number | null,
  measured?: Map<string, number>,
): FormulaResolver {
  const raw = new Map<string, string>()
  for (const parameter of assembly.parameters) {
    const override = parameterOverrideValue(overrides, assembly.id, parameter.code)
    raw.set(parameter.code, override ?? parameter.value ?? '')
  }

  const resolved = new Map<string, number>()
  const inProgress = new Set<string>()

  // A parameter with nothing to go on - no override, no measured binding, and no catalog
  // default - defaults to 1, not 0. Ratios like Bekistingsopp/Volume multiply a whole group of
  // cost lines; silently resolving an unfilled parameter to 0 would zero out every line under
  // it and look like the assembly is broken, instead of "not filled in yet".
  const UNSET_DEFAULT = 1

  const resolve: FormulaResolver = (name) => {
    if (name === LIVE_QUANTITY_TOKEN) return liveQuantity ?? 0
    if (measured?.has(name)) return measured.get(name) as number
    if (resolved.has(name)) return resolved.get(name) as number
    const source = raw.get(name)
    if (source == null || source.trim() === '') {
      resolved.set(name, UNSET_DEFAULT)
      return UNSET_DEFAULT
    }
    if (inProgress.has(name)) {
      console.warn(`[cost-assembly] circular parameter reference detected at '${name}'`)
      return UNSET_DEFAULT
    }
    inProgress.add(name)
    let value = UNSET_DEFAULT
    try {
      value = evaluateFormula(source, resolve)
    } catch {
      value = UNSET_DEFAULT
    }
    inProgress.delete(name)
    resolved.set(name, value)
    return value
  }

  return resolve
}

export function resolvedParameterValues(
  assembly: Pick<CostAssembly, 'id' | 'parameters'>,
  overrides: Record<string, string> | undefined,
  liveQuantity: number | null,
  measured?: Map<string, number>,
): Map<string, number> {
  const resolve = makeParameterResolver(assembly, overrides, liveQuantity, measured)
  const out = new Map<string, number>()
  for (const parameter of assembly.parameters) out.set(parameter.code, resolve(parameter.code))
  return out
}

export function displayParameterValue(
  parameter: AssemblyParameter,
  overrides: Record<string, string> | undefined,
  assemblyId: string,
): string {
  return parameterOverrideValue(overrides, assemblyId, parameter.code) ?? parameter.value ?? ''
}

export function parseParameterOverrides(value: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key && typeof item === 'string') out[key] = item
  }
  return out
}

/** Returns a new overrides map with `code` set to `value` for the given assembly, or removed
 *  when `value` is blank (falling back to the catalog default). */
export function setParameterOverride(
  overrides: Record<string, string>,
  assemblyId: string,
  code: string,
  value: string,
): Record<string, string> {
  const key = parameterOverrideKey(assemblyId, code)
  const next = { ...overrides }
  if (value.trim() === '') delete next[key]
  else next[key] = value
  return next
}

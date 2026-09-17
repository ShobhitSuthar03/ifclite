export type SkipHint = {
  id: number
  ifcType?: string
  name?: string
  volume?: number | null
}

export type SkipDecision = {
  id: number
  skip: boolean
  reason: string
  ifcType?: string
  name?: string
}

const SKIP_TYPES = new Set([
  'IFCOPENINGELEMENT',
  'IFCOPENINGSTANDARDCASE',
  'IFCSPACE',
  'IFCZONE',
  'IFCSPATIALZONE',
  'IFCANNOTATION',
  'IFCGRID',
  'IFCGRIDAXIS',
  'IFCVOIDINGFEATURE',
  'IFCVIRTUALELEMENT',
])

const TEMP_RE =
  /\b(temp(?:orary)?|scaffold(?:ing)?|shoring|auxiliary|aux(?:iliary)?|void(?:ing)?|clearance|crane|placeholder|tbd|concept|dummy|swept)\b/i

export function normalizeIfcType(typeName: string | null | undefined): string {
  return (typeName ?? '').trim().toUpperCase()
}

export function skipReasonFor(hint: SkipHint): SkipDecision {
  const ifcType = hint.ifcType?.trim() || undefined
  const name = hint.name?.trim() || undefined
  const typeKey = normalizeIfcType(ifcType)
  if (typeKey && SKIP_TYPES.has(typeKey)) {
    return {
      id: hint.id,
      skip: true,
      reason: `${ifcType} is a void/spatial/aux class — skip direct calculation`,
      ifcType,
      name,
    }
  }
  if (name && TEMP_RE.test(name)) {
    return {
      id: hint.id,
      skip: true,
      reason: `Name "${name}" looks temporary or auxiliary`,
      ifcType,
      name,
    }
  }
  if (hint.volume === 0) {
    return {
      id: hint.id,
      skip: true,
      reason: 'Zero-volume element',
      ifcType,
      name,
    }
  }
  return {
    id: hint.id,
    skip: false,
    reason: 'Calculate — permanent model element',
    ifcType,
    name,
  }
}

export function classifySkip(hints: SkipHint[]): SkipDecision[] {
  return hints.map(skipReasonFor)
}

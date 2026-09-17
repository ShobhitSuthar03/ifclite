import { extractEntityAttributesOnDemand, type IfcDataStore } from '@ifc-lite/parser'

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return ''
}

/** "IfcPile" → "Pile" so unnamed products still read as elements, not STEP ids. */
export function friendlyIfcType(typeName: string | null | undefined): string {
  const raw = typeName?.trim() ?? ''
  const stripped = raw.replace(/^Ifc/i, '')
  return stripped || 'Element'
}

export function elementDisplayName(parts: {
  name?: string | null
  tag?: string | null
  objectType?: string | null
  typeName?: string | null
}): string {
  return (
    firstNonEmpty(parts.name, parts.tag, parts.objectType, friendlyIfcType(parts.typeName)) || 'Element'
  )
}

export function elementTreeLabel(
  store: IfcDataStore | null,
  expressId: number,
  typeName?: string,
): string {
  const named = store?.entities.getName(expressId)
  const resolvedType = typeName || store?.entities.getTypeName(expressId)
  if (!store) return elementDisplayName({ name: named, typeName: resolvedType })
  try {
    const attrs = extractEntityAttributesOnDemand(store, expressId)
    return elementDisplayName({
      name: named || attrs.name,
      tag: attrs.tag,
      objectType: attrs.objectType,
      typeName: resolvedType,
    })
  } catch {
    return elementDisplayName({ name: named, typeName: resolvedType })
  }
}

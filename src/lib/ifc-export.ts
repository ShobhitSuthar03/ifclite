import { StepExporter, type StepExportResult } from '@ifc-lite/export'
import type { MutablePropertyView } from '@ifc-lite/mutations'
import type { IfcDataStore } from '@ifc-lite/parser'

export type IfcExportResult = {
  content: Uint8Array
  entityCount: number
  modifiedEntityCount: number
  warnings: string[]
}

/**
 * Bakes the mutation overlay (property/attribute edits - including anything
 * registered from the manual takeoff face basket) back into a full, complete IFC
 * file - geometry, relationships, and everything else round-trip from the
 * original source unchanged; only the mutated entities are rewritten.
 *
 * NOT `exporter.exportPropertiesOnly()`: despite the name, that produces a
 * lightweight DELTA file containing only the changed property/quantity data (a
 * patch, not a usable model) - the wrong tool for "give me my edited IFC file
 * back".
 */
export function exportIfcWithMutations(
  store: IfcDataStore,
  mutationView: MutablePropertyView | null,
): IfcExportResult {
  const exporter = new StepExporter(store, mutationView ?? undefined)
  const result: StepExportResult = exporter.export({
    schema: store.schemaVersion,
    includeGeometry: true,
    includeProperties: true,
    includeQuantities: true,
    includeRelationships: true,
    applyMutations: true,
  })
  return {
    content: result.content,
    entityCount: result.stats.entityCount,
    modifiedEntityCount: result.stats.modifiedEntityCount,
    warnings: result.stats.warnings,
  }
}

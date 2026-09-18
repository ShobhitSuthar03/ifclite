/**
 * Tracks loaded IFC models in a federated session and assigns each one a
 * non-overlapping range of "global" element ids, so `expressId` (a raw IFC
 * STEP entity number, unique only within its own file) becomes a single
 * opaque number that's unique across every loaded model. Every consumer
 * downstream (selection, the geometry-qto pipeline, the bim-sql warehouse,
 * MCP tools) keeps treating that number as a plain unique id - none of them
 * need to know it's composite, as long as the conversion happens once, where
 * a model's data first enters the app.
 *
 * Mirrors the design at https://ifclite.dev/docs/guide/federation/:
 * globalId = expressId + model.idOffset, resolved O(1) local->global and
 * O(log N) global->local.
 */

export type FederatedModel = {
  id: string
  name: string
  idOffset: number
  maxExpressId: number
  visible: boolean
  collapsed: boolean
}

export type EntityRef = {
  modelId: string
  expressId: number
}

// Offsets round up to the next multiple of this so per-model ranges stay
// human-readable (the docs' own example uses a round "offset: 5000") and so
// a model can absorb some post-load growth (edits, appended elements)
// without colliding with the next model's range.
const OFFSET_ROUND_STEP = 1000

function roundUpToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step
}

export class FederationRegistry {
  private byId = new Map<string, FederatedModel>()
  // Insertion order is offset-ascending by construction (each new model's
  // offset is derived from the previous one), so this doubles as the sorted
  // list fromGlobalId's binary search needs - no separate sort step.
  private sortedByOffset: FederatedModel[] = []

  /**
   * Registers a newly-loaded model and assigns it a non-overlapping id range
   * starting after every currently-registered model. The very first model
   * always gets offset 0, so a single-model session's global ids are
   * numerically identical to its raw expressIds.
   */
  registerModel(modelId: string, name: string, maxExpressId: number): FederatedModel {
    if (this.byId.has(modelId)) {
      throw new Error(`FederationRegistry: model "${modelId}" is already registered`)
    }
    const last = this.sortedByOffset.at(-1)
    const idOffset = last ? roundUpToStep(last.idOffset + last.maxExpressId + 1, OFFSET_ROUND_STEP) : 0
    const model: FederatedModel = { id: modelId, name, idOffset, maxExpressId, visible: true, collapsed: false }
    this.byId.set(modelId, model)
    this.sortedByOffset.push(model)
    return model
  }

  /**
   * Like registerModel, but idempotent: if the model is already registered
   * (e.g. a geometry loader and a warehouse ingest both onboarding the same
   * file, each not knowing whether the other went first), returns the
   * existing registration instead of throwing - whichever call happened
   * first is the one that decided the offset. `maxExpressId` is widened to
   * the larger of the two observed values, since a later, more complete scan
   * of the same model may see a higher id than an earlier, partial one; that
   * only affects the range reserved for models registered afterward, never
   * this model's own already-assigned offset.
   */
  ensureModel(modelId: string, name: string, maxExpressId: number): FederatedModel {
    const existing = this.byId.get(modelId)
    if (existing) {
      existing.maxExpressId = Math.max(existing.maxExpressId, maxExpressId)
      return existing
    }
    return this.registerModel(modelId, name, maxExpressId)
  }

  removeModel(modelId: string): void {
    if (!this.byId.delete(modelId)) return
    this.sortedByOffset = this.sortedByOffset.filter((item) => item.id !== modelId)
  }

  getModel(modelId: string): FederatedModel | undefined {
    return this.byId.get(modelId)
  }

  listModels(): FederatedModel[] {
    return [...this.sortedByOffset]
  }

  setVisible(modelId: string, visible: boolean): void {
    const model = this.byId.get(modelId)
    if (model) model.visible = visible
  }

  setCollapsed(modelId: string, collapsed: boolean): void {
    const model = this.byId.get(modelId)
    if (model) model.collapsed = collapsed
  }

  rename(modelId: string, name: string): void {
    const model = this.byId.get(modelId)
    if (model) model.name = name
  }

  /** O(1): local expressId -> global id. Throws for an unregistered model,
   * since a caller asking to globalize an id for a model it never
   * registered is a bug, not a recoverable "unknown id" case. */
  toGlobalId(modelId: string, expressId: number): number {
    const model = this.byId.get(modelId)
    if (!model) throw new Error(`FederationRegistry: unknown model "${modelId}"`)
    return model.idOffset + expressId
  }

  /** O(log N): global id -> which model + its local expressId, via binary
   * search over the sorted offset ranges. Returns null for an id outside
   * every registered range (never registered, or its model was removed). */
  fromGlobalId(globalId: number): EntityRef | null {
    const models = this.sortedByOffset
    let lo = 0
    let hi = models.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const model = models[mid]
      if (globalId < model.idOffset) {
        hi = mid - 1
      } else if (globalId > model.idOffset + model.maxExpressId) {
        lo = mid + 1
      } else {
        return { modelId: model.id, expressId: globalId - model.idOffset }
      }
    }
    return null
  }
}

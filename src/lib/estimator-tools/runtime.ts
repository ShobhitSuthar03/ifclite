import type { CostAssemblyCatalog } from '@/lib/cost-assembly/types'
import { parseEstimation } from '@/lib/estimation/parse'
import { emptyEstimation, type EstimationDoc } from '@/lib/estimation/types'
import type { QuantityResult } from '@/lib/geometry-qto'
import type { PropertyTreeNode } from '@/lib/property-tree'
import type { SkipHint } from '@/lib/estimator-tools/skip'
import type {
  PropertySearchInput,
  PropertySearchResult,
  ViewerAction,
} from '@/lib/estimator-tools/viewer'

export type CatalogSummary = {
  path: string
  name: string
  catalogName: string
  assemblyCount: number
}

export type EstimatorSyncPayload = {
  revision: number
  force?: boolean
  estimation?: unknown
  selectedIds?: number[]
  quantities?: QuantityResult | null
  previewTree?: PropertyTreeNode[]
  catalogPath?: string
  catalogSummary?: CatalogSummary | null
  elementHints?: SkipHint[]
  consumedViewer?: number
  searchResults?: PropertySearchResult | null
}

export type EstimatorSyncSnapshot = {
  revision: number
  origin: 'app' | 'agent'
  estimation: EstimationDoc
  selectedIds: number[]
  catalogSummary: CatalogSummary | null
  catalogPath: string | null
  quantityCount: number
  previewCount: number
  pendingTakeoffIds: number[]
  pendingViewer: ViewerAction[]
  pendingSearch: PropertySearchInput | null
}

export class EstimatorRuntime {
  catalog: CostAssemblyCatalog | null = null
  catalogPath: string | null = null
  catalogSummary: CatalogSummary | null = null
  quantities: QuantityResult | null = null
  estimation: EstimationDoc = emptyEstimation()
  selectedIds: number[] = []
  previewTree: PropertyTreeNode[] = []
  revision = 0
  origin: 'app' | 'agent' = 'app'
  hints = new Map<number, SkipHint>()
  pendingTakeoffIds: number[] = []
  pendingViewer: ViewerAction[] = []
  pendingSearch: PropertySearchInput | null = null
  searchResults: PropertySearchResult | null = null
  ensureQuantities?: (ids: number[]) => Promise<void>
  applyViewer?: (action: ViewerAction) => void | Promise<void>
  searchElements?: (input: PropertySearchInput) => Promise<PropertySearchResult>

  snapshot(): EstimatorSyncSnapshot {
    return {
      revision: this.revision,
      origin: this.origin,
      estimation: this.estimation,
      selectedIds: [...this.selectedIds],
      catalogSummary: this.catalogSummary,
      catalogPath: this.catalogPath,
      quantityCount: this.quantities?.elements.length ?? 0,
      previewCount: this.previewTree.length,
      pendingTakeoffIds: [...this.pendingTakeoffIds],
      pendingViewer: [...this.pendingViewer],
      pendingSearch: this.pendingSearch,
    }
  }

  setCatalog(catalog: CostAssemblyCatalog | null, path?: string | null) {
    this.catalog = catalog
    this.catalogPath = path ?? catalog?.sourcePath ?? this.catalogPath
    this.catalogSummary = catalog
      ? {
          path: catalog.sourcePath,
          name: catalog.sourceName,
          catalogName: catalog.catalogName,
          assemblyCount: catalog.assemblies.length,
        }
      : null
  }

  mergeHints(hints: SkipHint[] | undefined) {
    if (!hints) return
    for (const hint of hints) {
      if (!Number.isFinite(hint.id)) continue
      const prev = this.hints.get(hint.id)
      this.hints.set(hint.id, { ...prev, ...hint, id: hint.id })
    }
  }

  hintFor(id: number): SkipHint {
    const stored = this.hints.get(id)
    const qty = this.quantities?.elements.find((element) => element.expressId === id)
    return {
      id,
      ifcType: stored?.ifcType ?? qty?.ifcType,
      name: stored?.name,
      volume: stored?.volume ?? qty?.metrics.VOLUME ?? null,
    }
  }

  applyFromApp(payload: EstimatorSyncPayload): { accepted: boolean; snapshot: EstimatorSyncSnapshot } {
    if (payload.quantities) this.quantities = payload.quantities
    if (payload.selectedIds) this.selectedIds = payload.selectedIds.filter((id) => Number.isFinite(id))
    if (payload.previewTree) this.previewTree = payload.previewTree
    if (payload.catalogSummary) this.catalogSummary = payload.catalogSummary
    if (payload.catalogPath) this.catalogPath = payload.catalogPath
    if (payload.consumedViewer != null && payload.consumedViewer > 0) {
      this.pendingViewer = this.pendingViewer.slice(payload.consumedViewer)
    }
    if (payload.searchResults) {
      this.searchResults = payload.searchResults
      this.pendingSearch = null
    }
    this.mergeHints(payload.elementHints)
    if (!payload.force && this.origin === 'agent' && payload.revision < this.revision) {
      return { accepted: false, snapshot: this.snapshot() }
    }
    if (payload.estimation !== undefined) {
      this.estimation = parseEstimation(payload.estimation)
    }
    if (payload.estimation !== undefined || payload.force) {
      this.revision = Math.max(this.revision, payload.revision)
      this.origin = 'app'
    }
    return { accepted: true, snapshot: this.snapshot() }
  }

  mutate(next: EstimationDoc): EstimatorSyncSnapshot {
    this.estimation = next
    this.origin = 'agent'
    this.revision += 1
    return this.snapshot()
  }

  requestTakeoff(ids: number[]) {
    const have = new Set(this.quantities?.elements.map((element) => element.expressId) ?? [])
    const missing = ids.filter((id) => Number.isFinite(id) && !have.has(id))
    if (missing.length === 0) return
    const pending = new Set(this.pendingTakeoffIds)
    for (const id of missing) pending.add(id)
    this.pendingTakeoffIds = [...pending]
  }

  clearTakeoff(ids: number[]) {
    const done = new Set(ids)
    this.pendingTakeoffIds = this.pendingTakeoffIds.filter((id) => !done.has(id))
  }

  enqueueViewer(action: ViewerAction) {
    this.pendingViewer = [...this.pendingViewer, action]
  }

  requestSearch(input: PropertySearchInput) {
    this.pendingSearch = input
    this.searchResults = null
  }
}

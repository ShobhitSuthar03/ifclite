import type { DragEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppHeader } from '@/components/app-header'
import { EmptyState } from '@/components/empty-state'
import { LoadingOverlay } from '@/components/loading-overlay'
import { LeftDock, type LeftTab } from '@/components/left-dock'
import { ResizeHandle } from '@/components/resize-handle'
import { RightDock, type RightTab } from '@/components/right-dock'
import { StatusBar } from '@/components/status-bar'
import { useTheme } from '@/components/theme-provider'
import { ToolStrip } from '@/components/tool-strip'
import { ViewerCanvas } from '@/components/viewer-canvas'
import { ScheduleDock, SCHEDULE_PANEL_DEFAULT_HEIGHT, type BottomWorkspaceTab } from '@/components/schedule-panel'
import { CostAssemblyPanel } from '@/components/cost-assembly-panel'
import { EstimationPanel } from '@/components/estimation-panel'
import { AssemblyBuildUp } from '@/components/assembly-buildup'
import { ElementCostCard } from '@/components/element-cost-card'
import { ESTIMATION_ENABLED } from '@/lib/feature-flags'
import { MAX_DETAILED_MULTI_SELECT } from '@/lib/common-properties'
import {
  buildDataStore,
  buildSpatialTreeFromStore,
  getEntityData,
  type EntityData,
  type IfcDataStore,
  type SpatialTreeNode,
} from '@/lib/ifc-data'
import {
  getGeometryEngineStatus,
  loadIfcModel,
  pickIfcFile,
  resolveSourceBytes,
  subscribeGeometryEngine,
  type GeometryEngineStatus,
  type LoadProgress,
  type LoadResult,
  type LoadSource,
} from '@/lib/ifc-loader'
import {
  computeElementQuantities,
  encodeStoredQuantities,
  hydrateFacePositions,
  isCompleteTakeoff,
  mergeQuantityElements,
  parseStoredQuantities,
  sanitizePropertyName,
  typeQtoMeshes,
  type ElementQuantity,
  type FaceQuantity,
  type QuantityResult,
} from '@/lib/geometry-qto'
import {
  EMPTY_QUERY,
  executeQuery,
  isQueryActive,
  queryIds,
  createIfcQuery,
  type QuerySpec,
} from '@/lib/ifc-query'
import { useEstimationPanes, usePanelWidths } from '@/lib/panel-layout'
import { broadcastPaneState, closePaneWindow, onPaneAction, onPaneClosed, openPaneWindow } from '@/lib/pane-sync'
import type { BuildUpPaneAction, BuildUpPaneState } from '@/pane-app'
import { cn } from '@/lib/utils'
import { applyClickSelection, setsEqual } from '@/lib/selection'
import {
  ghostExpressIds,
  visibleExpressIds,
  OPENING_IFC_TYPES,
  SPATIAL_IFC_TYPES,
  type DisplayMode,
} from '@/lib/view-visibility'
import { intersectIds } from '@/lib/spatial-scope'
import { createLensProvider, propertyCatalogFromLensProvider } from '@/lib/lens-provider'
import {
  colorizeLeaves,
  colorMapFromTree,
  isIfcTypeRef,
  nestByValues,
  type PropertyRef,
  type PropertyTreeNode,
  propertyRefKey,
  propertySelectionLabel,
  toggleFilterKeys,
  unionPropertyNodeIds,
} from '@/lib/property-tree'
import { missingTakeoffIds, resolveTakeoffTarget, TAKEOFF_CHUNK, xorIds, type TakeoffProgress } from '@/lib/takeoff-scope'
import { overlayAttributeKey, overlayFromPatches } from '@/lib/mutation-overlay'
import { createMutationView, createWarehouseMutationView, overlayEntityData } from '@/lib/mutation-view'
import { recycleCsvProcessor } from '@/lib/csv-export'
import {
  EMPTY_REPORT_FILTER,
  applyGeometryQuantities,
  closeBimDatabase,
  downloadTextFile,
  exportBimDatabase,
  insertElementRecords,
  collectElementRecordsRange,
  listWarehouseElementIds,
  startWarehouseIngest,
  applyMutationPatchesToWarehouse,
  WAREHOUSE_INGEST_CHUNK,
  loadFilterOptions,
  openBimDatabase,
  openBimDatabaseFromBytes,
  queryElementIds,
  queryQaIds,
  reportToCsv,
  reportToJson,
  reportToSpreadsheetXml,
  runReport,
  spatialTreeFromWarehouse,
  entityDataFromWarehouse,
  elementLookupFromWarehouse,
  globalIdsByExpressIds,
  propertyCatalogFromWarehouse,
  queryWarehouse,
  buildWarehousePropertyTree,
  loadValueLabels,
  warehouseScopeIds,
  sumNumericValues,
  type BimDatabase,
  type FilterOptions,
  type GroupByField,
  type MetricField,
  type ReportFilter,
  type ReportResult,
  type ReportRow,
  type ReportTemplate,
} from '@/lib/bim-sql'
import {
  closeProject,
  createProject,
  deleteProject,
  getProjectQuantities,
  getProjectWarehouse,
  getProjectsRoot,
  importIfcBytes,
  importIfcPath,
  listProjects,
  openProject,
  projectsAvailable,
  saveProjectSession,
  saveProjectQuantities,
  saveProjectWarehouse,
  sessionFromSnapshot,
  writeIfcFile,
  type ProjectRecord,
  type ProjectSnapshot,
} from '@/lib/projects'
import { exportIfcWithMutations } from '@/lib/ifc-export'
import { save as saveFileDialog } from '@tauri-apps/plugin-dialog'
import {
  persistableQuantities,
  type MutationPatch,
  type ProjectSession,
} from '@/lib/project-session'
import { createSavedView, replaceSavedViewIds, viewFileStem, type SavedView } from '@/lib/saved-views'
import { extractGanttFromStore } from '@/lib/schedule/from-ifc'
import { importScheduleFile } from '@/lib/schedule/import'
import { applyTaskCosts, extractTaskCosts } from '@/lib/schedule/cost'
import { pickScheduleFile } from '@/lib/schedule/pick'
import { extractProductResources } from '@/lib/schedule/resource-load'
import { activityTint } from '@/lib/schedule/activity-color'
import { productWindows, simulateAt } from '@/lib/schedule/simulate'
import type { GanttModel, GanttTask } from '@/lib/schedule/types'
import {
  DEFAULT_COST_ASSEMBLY_PATH,
  loadCostAssemblyCatalog,
  parsePickedCostAssembly,
  pickCostAssemblyFile,
  statLocalFile,
} from '@/lib/cost-assembly/load'
import type { CostAssembly, CostAssemblyCatalog } from '@/lib/cost-assembly/types'
import {
  activeBoq,
  bindImportedBoq,
  collectLinkProperties,
  emptyEstimation,
  findBoqLeafForElement,
  findBoqNode,
  flattenBoq,
  mapActiveBoq,
  qtyBindingKey,
  quantityForIds,
  rebuildBoq,
  elementBuildUps,
  type BoqDoc,
  type EstimationDoc,
  type QtyBinding,
} from '@/lib/estimation'
import { buildUpRows } from '@/lib/cost-assembly/build-up'
import { setParameterOverride } from '@/lib/cost-assembly/params'
import { setParamBinding, type ParamBinding } from '@/lib/estimation/param-bind'
import { isDesktopShell } from '@/lib/host'
import { elementTreeLabel } from '@/lib/element-label'
import { EstimatorAgentPanel } from '@/components/estimator-agent-panel'
import { searchModelElements } from '@/lib/estimator-tools/model-search'
import { summarizeModelForAgent, type PropertySearchInput, type ViewerAction } from '@/lib/estimator-tools'
import {
  getEstimatorSync,
  joinProjectFile,
  postEstimatorSync,
  startMcpHost,
  stopMcpHost,
  waitForMcpReady,
} from '@/lib/mcp/host'
import { createViewerMeshStore } from '@/lib/viewer-meshes'
import { typeTreeFromMeshes, uniqueIfcTypeTree } from '@/lib/geometry-tree'
import { labelStorePropertyChunk, loadStoreValueLabels, STORE_PROPERTY_CHUNK } from '@/lib/store-property-tree'

type MobileTab = LeftTab | RightTab

const MAX_RESTORED_QUANTITIES_CHARS = 4_000_000
const EMPTY_EXPRESS_IDS = new Set<number>()

/**
 * Which of an element's faces a raw 3D click landed on, using the face's own plane
 * (normal direction + offset) rather than a full point-in-polygon test - faces of one
 * element are ordinary planar sides, so "closest matching plane, same direction" is
 * enough to disambiguate them reliably.
 */
function matchFaceAtPoint(
  faces: FaceQuantity[],
  point: [number, number, number],
  hitNormal: [number, number, number],
): FaceQuantity | null {
  let best: FaceQuantity | null = null
  let bestDist = Infinity
  for (const face of faces) {
    if (face.positions.length < 3) continue
    const alignment =
      face.normal[0] * hitNormal[0] + face.normal[1] * hitNormal[1] + face.normal[2] * hitNormal[2]
    if (alignment < 0.9) continue
    const planeOffset =
      face.positions[0] * face.normal[0] + face.positions[1] * face.normal[1] + face.positions[2] * face.normal[2]
    const dist = Math.abs(
      point[0] * face.normal[0] + point[1] * face.normal[1] + point[2] * face.normal[2] - planeOffset,
    )
    if (dist < bestDist) {
      bestDist = dist
      best = face
    }
  }
  return bestDist < 0.05 ? best : null
}

function readEntity(
  store: IfcDataStore | null,
  warehouse: BimDatabase | null,
  expressId: number,
  ifcType: string,
): EntityData {
  if (!store) {
    if (warehouse) return entityDataFromWarehouse(warehouse, expressId, ifcType)
    return {
      expressId,
      ifcType,
      globalId: '',
      name: '',
      description: '',
      objectType: '',
      tag: '',
      propertySets: [],
      quantitySets: [],
    }
  }
  try {
    return getEntityData(store, expressId, ifcType)
  } catch {
    return {
      expressId,
      ifcType,
      globalId: '',
      name: store.entities.getName(expressId) || '',
      description: '',
      objectType: '',
      tag: '',
      propertySets: [],
      quantitySets: [],
    }
  }
}

export default function App() {
  const [result, setResult] = useState<LoadResult | null>(null)
  const [sceneReady, setSceneReady] = useState(false)
  const [geometryGen, setGeometryGen] = useState(0)
  const [progress, setProgress] = useState<LoadProgress | null>(null)
  const [loadingName, setLoadingName] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [fitToken, setFitToken] = useState(0)
  const [store, setStore] = useState<IfcDataStore | null>(null)
  const [spatialRoot, setSpatialRoot] = useState<SpatialTreeNode | null>(null)
  const [mobileTab, setMobileTab] = useState<MobileTab>('tree')
  const [spec, setSpec] = useState<QuerySpec>(EMPTY_QUERY)
  const [filterRules, setFilterRules] = useState<PropertyRef[]>([])
  const [filterNodeKeys, setFilterNodeKeys] = useState<string[]>([])
  const [filterNodeIds, setFilterNodeIds] = useState<Set<number> | null>(null)
  const [filterColorize, setFilterColorize] = useState(false)
  const [storeFilterTree, setStoreFilterTree] = useState<PropertyTreeNode[]>([])
  const [leftTab, setLeftTab] = useState<LeftTab>('tree')
  const [rightTab, setRightTab] = useState<RightTab>('properties')
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [ifcExportBusy, setIfcExportBusy] = useState(false)
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [exportingViewId, setExportingViewId] = useState<string | null>(null)
  const [engineStatus, setEngineStatus] = useState<GeometryEngineStatus>(getGeometryEngineStatus)
  const [quantities, setQuantities] = useState<QuantityResult | null>(null)
  const [quantityBusy, setQuantityBusy] = useState(false)
  const [takeoffProgress, setTakeoffProgress] = useState<TakeoffProgress | null>(null)
  const [takeoffScopeKey, setTakeoffScopeKey] = useState<string | null>(null)
  const [takeoffDismissedKey, setTakeoffDismissedKey] = useState<string | null>(null)
  const [calculatedView, setCalculatedView] = useState(false)
  const [selectedFaceId, setSelectedFaceId] = useState<string | null>(null)
  const [faceSelectMode, setFaceSelectMode] = useState(false)
  const [faceBasketExpressId, setFaceBasketExpressId] = useState<number | null>(null)
  const [faceBasket, setFaceBasket] = useState<Map<string, FaceQuantity>>(() => new Map())
  const [displayMode, setDisplayMode] = useState<DisplayMode>('all')
  const [focusIds, setFocusIds] = useState<Set<number>>(() => new Set())
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(() => new Set())
  const [showOpenings, setShowOpenings] = useState(false)
  const [showSpaces, setShowSpaces] = useState(false)
  const [treeScopeIds, setTreeScopeIds] = useState<Set<number> | null>(null)
  const [parseTick, setParseTick] = useState(0)
  const [mutationTick, setMutationTick] = useState(0)
  const [warehouse, setWarehouse] = useState<BimDatabase | null>(null)
  const [warehouseBusy, setWarehouseBusy] = useState(false)
  const [warehouseRequested, setWarehouseRequested] = useState(false)
  const [warehouseProgress, setWarehouseProgress] = useState<{ done: number; total: number } | null>(null)
  const [warehouseEpoch, setWarehouseEpoch] = useState(0)
  const [reportTemplate, setReportTemplate] = useState<ReportTemplate>('qto')
  const [reportGroupBy, setReportGroupBy] = useState<GroupByField>('category')
  const [reportMetrics, setReportMetrics] = useState<MetricField[]>(['count', 'volume', 'area', 'cost'])
  const [reportFilter, setReportFilter] = useState<ReportFilter>(EMPTY_REPORT_FILTER)
  const [followViewer, setFollowViewer] = useState(true)
  const [reportTick, setReportTick] = useState(0)
  const [project, setProject] = useState<ProjectRecord | null>(null)
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [projectsRoot, setProjectsRoot] = useState<string | null>(null)
  const [desktopHost, setDesktopHost] = useState(() => projectsAvailable())
  const [homeOpen, setHomeOpen] = useState(() => projectsAvailable())
  const [mutationPatches, setMutationPatches] = useState<MutationPatch[]>([])
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleHeight, setScheduleHeight] = useState(SCHEDULE_PANEL_DEFAULT_HEIGHT)
  const [bottomTab, setBottomTab] = useState<BottomWorkspaceTab>('schedule')
  const [ifcGantt, setIfcGantt] = useState<GanttModel | null>(null)
  const [importedGantt, setImportedGantt] = useState<GanttModel | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [simDate, setSimDate] = useState<Date | null>(null)
  const [assemblyCatalog, setAssemblyCatalog] = useState<CostAssemblyCatalog | null>(null)
  const [assemblyError, setAssemblyError] = useState<string | null>(null)
  const [assemblyLoading, setAssemblyLoading] = useState(false)
  const [assemblyPath, setAssemblyPath] = useState(DEFAULT_COST_ASSEMBLY_PATH)
  const [selectedAssemblyId, setSelectedAssemblyId] = useState<string | null>(null)
  const [estimation, setEstimation] = useState<EstimationDoc>(() => emptyEstimation())
  const [selectedBoqId, setSelectedBoqId] = useState<string | null>(null)
  const [estimationStoreTree, setEstimationStoreTree] = useState<PropertyTreeNode[]>([])
  const [buildUpHeight, setBuildUpHeight] = useState(280)
  const [buildupPopped, setBuildupPopped] = useState(false)
  const [estimatorHeight, setEstimatorHeight] = useState(240)
  const [mcp, setMcp] = useState<{
    url: string
    token: string
    syncPort: number
    ready: boolean
    error: string | null
  } | null>(null)
  const mcpRevision = useRef(0)
  const applyingAgentSync = useRef(false)
  const [geometryStore] = useState(createViewerMeshStore)
  const loadGen = useRef(0)
  const pendingSession = useRef<ProjectSession | null>(null)
  const pendingWarehouseRestore = useRef(false)
  const pendingQuantitiesRestore = useRef(false)
  const pendingParse = useRef(false)
  const facePositionCache = useRef<Map<number, ElementQuantity>>(new Map())
  const lastLoadSource = useRef<LoadSource | null>(null)
  const assemblyPathRef = useRef(assemblyPath)
  assemblyPathRef.current = assemblyPath
  const assemblyStampRef = useRef(0)
  const warehouseRestored = useRef(false)
  const warehouseBuild = useRef(false)
  const takeoffGen = useRef(0)
  const quantitiesRef = useRef<QuantityResult | null>(null)
  const runTakeoffRef = useRef<(ids: number[], key: string) => void>(() => {})
  const quantityBusyRef = useRef(false)
  const applyAgentViewerRef = useRef<(action: ViewerAction) => void>(() => {})
  const searchElementsRef = useRef<(input: PropertySearchInput) => ReturnType<typeof searchModelElements>>(
    () => ({ ids: [], hits: [], truncated: false }),
  )
  const viewerBusyRef = useRef(false)
  const searchBusyRef = useRef(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const leftPaneRef = useRef<HTMLDivElement>(null)
  const rightPaneRef = useRef<HTMLDivElement>(null)
  const estimationPaneRef = useRef<HTMLDivElement>(null)
  const hoverBindRef = useRef<((id: number | null) => void) | null>(null)
  const hoverLookupRef = useRef<(id: number) => string>(() => '')
  const mutationPatchesRef = useRef<MutationPatch[]>([])
  mutationPatchesRef.current = mutationPatches
  const {
    leftWidth,
    rightWidth,
    estimationWidth,
    dragLeft,
    dragRight,
    dragEstimation,
    commitLeft,
    commitRight,
    commitEstimation,
    resetLeft,
    resetRight,
    resetEstimation,
  } = usePanelWidths()
  const { panes: estimationPanes, setPane: setEstimationPane, togglePane: toggleEstimationPane } = useEstimationPanes()
  const { theme } = useTheme()

  useEffect(() => subscribeGeometryEngine(setEngineStatus), [])

  const applySession = useCallback((session: ProjectSession) => {
    setDisplayMode('all')
    setRightTab(session.rightTab === 'quantities' ? 'properties' : session.rightTab)
    setFilterRules(session.filterRules)
    setFilterNodeKeys([])
    setFilterNodeIds(null)
    setFilterColorize(false)
    setReportTemplate(session.reportTemplate)
    setReportGroupBy(session.reportGroupBy)
    setReportMetrics(session.reportMetrics)
    setReportFilter(session.reportFilter)
    setFollowViewer(session.followViewer)
    setMutationPatches(session.mutations)
    setSavedViews(session.savedViews ?? [])
    setEstimation(session.estimation ?? emptyEstimation())
    setSelectedBoqId(null)
    setActiveViewId(null)
  }, [])

  const persistWarehouse = useCallback((db: BimDatabase) => {
    if (!projectsAvailable() || !project) return
    window.setTimeout(() => {
      try {
        void saveProjectWarehouse(exportBimDatabase(db))
      } catch (caught) {
        console.warn('Could not save warehouse.sqlite', caught)
      }
    }, 0)
  }, [project])

  const publishMutations = useCallback(
    (next: MutationPatch[]) => {
      setMutationPatches(next)
      setMutationTick((tick) => tick + 1)
      if (!warehouse) return
      applyMutationPatchesToWarehouse(warehouse, next)
      setReportTick((tick) => tick + 1)
      persistWarehouse(warehouse)
    },
    [warehouse, persistWarehouse],
  )

  const rememberSnapshot = useCallback(async (snapshot: ProjectSnapshot, restoreSession = true) => {
    setProject(snapshot)
    pendingSession.current = restoreSession ? sessionFromSnapshot(snapshot) : null
    pendingWarehouseRestore.current = restoreSession && snapshot.hasWarehouse
    pendingQuantitiesRestore.current = restoreSession && snapshot.hasQuantities
    void listProjects()
      .then(setProjects)
      .catch(() => undefined)
  }, [])

  // Restore warehouse.sqlite after 3D is on screen. Do not wait for a dock tab —
  // that file already has the property index from the last session.
  useEffect(() => {
    if (busy || !result || !sceneReady) return
    if (!pendingWarehouseRestore.current || warehouseRestored.current) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled || !pendingWarehouseRestore.current || warehouseRestored.current) return
      setWarehouseBusy(true)
      void (async () => {
        try {
          const bytes = await getProjectWarehouse()
          if (cancelled) return
          if (!bytes) {
            pendingWarehouseRestore.current = false
            setWarehouseEpoch((tick) => tick + 1)
            return
          }
          try {
            const db = await openBimDatabaseFromBytes(bytes)
            if (cancelled) {
              closeBimDatabase(db)
              return
            }
            warehouseRestored.current = true
            pendingWarehouseRestore.current = false
            applyMutationPatchesToWarehouse(db, mutationPatchesRef.current)
            setWarehouse((current) => {
              closeBimDatabase(current)
              return db
            })
            const tree = spatialTreeFromWarehouse(db)
            if (tree) setSpatialRoot(tree)
            setReportTick((tick) => tick + 1)
          } catch (caught) {
            console.warn('Saved warehouse.sqlite was unreadable; rebuilding', caught)
            warehouseRestored.current = false
            pendingWarehouseRestore.current = false
            setWarehouseEpoch((tick) => tick + 1)
          }
        } catch (caught) {
          if (!cancelled) {
            pendingWarehouseRestore.current = false
            setWarehouseEpoch((tick) => tick + 1)
            console.warn('Could not restore warehouse.sqlite', caught)
          }
        } finally {
          if (!cancelled) setWarehouseBusy(false)
        }
      })()
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [busy, sceneReady, result])

  useEffect(() => {
    if (!warehouseRequested || warehouse || busy || !result || !sceneReady) return
    if (pendingWarehouseRestore.current || warehouseRestored.current) return
    if (!store || parsing || warehouseBuild.current) return
    warehouseBuild.current = true
    let cancelled = false
    let frame = 0
    setWarehouseBusy(true)
    setWarehouseProgress({ done: 0, total: 0 })
    void (async () => {
      try {
        const db = await openBimDatabase()
        if (cancelled) {
          closeBimDatabase(db)
          return
        }
        const ids = listWarehouseElementIds(store, geometryStore.ids())
        const query = createIfcQuery(store)
        setWarehouseProgress({ done: 0, total: ids.length })
        await new Promise<void>((resolve) => {
          frame = requestAnimationFrame(() => resolve())
        })
        if (cancelled) {
          closeBimDatabase(db)
          return
        }
        const modelId = startWarehouseIngest(db, spatialRoot, result.fileName, result.cacheKey)
        if (cancelled) {
          closeBimDatabase(db)
          return
        }
        let index = 0
        const pump = () => {
          if (cancelled) {
            closeBimDatabase(db)
            return
          }
          try {
            const end = Math.min(index + WAREHOUSE_INGEST_CHUNK, ids.length)
            insertElementRecords(db, modelId, collectElementRecordsRange(store, ids, index, end, query))
            index = end
            setWarehouseProgress({ done: index, total: ids.length })
            if (index < ids.length) {
              frame = requestAnimationFrame(pump)
              return
            }
            applyMutationPatchesToWarehouse(db, mutationPatchesRef.current)
            setWarehouse((current) => {
              closeBimDatabase(current)
              return db
            })
            setReportTick((tick) => tick + 1)
            setWarehouseBusy(false)
            setWarehouseProgress(null)
            warehouseBuild.current = false
            if (projectsAvailable() && project) {
              window.setTimeout(() => {
                try {
                  void saveProjectWarehouse(exportBimDatabase(db))
                } catch (caught) {
                  console.warn('Could not save warehouse.sqlite', caught)
                }
              }, 0)
            }
          } catch (caught) {
            warehouseBuild.current = false
            closeBimDatabase(db)
            if (!cancelled) {
              setWarehouseBusy(false)
              setWarehouseProgress(null)
              setWarehouseRequested(false)
              console.warn('BIM warehouse ingest failed', caught)
              setError(caught instanceof Error ? caught.message : String(caught))
            }
          }
        }
        frame = requestAnimationFrame(pump)
      } catch (caught) {
        warehouseBuild.current = false
        if (!cancelled) {
          setWarehouseBusy(false)
          setWarehouseProgress(null)
          setWarehouseRequested(false)
          console.warn('BIM warehouse ingest failed', caught)
          setError(caught instanceof Error ? caught.message : String(caught))
        }
      }
    })()
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      warehouseBuild.current = false
    }
  }, [
    warehouseRequested,
    warehouse,
    warehouseEpoch,
    busy,
    sceneReady,
    store,
    spatialRoot,
    result,
    project,
    parsing,
    geometryStore,
  ])

  useEffect(() => {
    if (!warehouseRequested || busy || !sceneReady || !warehouse || !quantities) return
    applyGeometryQuantities(warehouse, quantities)
    setReportTick((tick) => tick + 1)
  }, [warehouseRequested, busy, sceneReady, warehouse, quantities])

  const load = useCallback(async (source: LoadSource) => {
    const gen = loadGen.current + 1
    loadGen.current = gen
    lastLoadSource.current = source
    setHomeOpen(false)
    setBusy(true)
    setSceneReady(false)
    setLoadingName(source.name)
    pendingParse.current = false
    setParsing(false)
    setWarehouseBusy(false)
    setWarehouseRequested(false)
    setWarehouseProgress(null)
    warehouseBuild.current = false
    setError(null)
    setSelectedId(null)
    setSelectedIds(new Set())
    geometryStore.clear()
    setGeometryGen((tick) => tick + 1)
    setResult(null)
    setStore(null)
    setSpatialRoot(null)
    setSourceBytes(null)
    setExportMessage(null)
    setQuantities(null)
    setQuantityBusy(false)
    setTakeoffProgress(null)
    setTakeoffScopeKey(null)
    setTakeoffDismissedKey(null)
    takeoffGen.current += 1
    facePositionCache.current.clear()
    setCalculatedView(false)
    setSelectedFaceId(null)
    setFaceSelectMode(false)
    setFaceBasketExpressId(null)
    setFaceBasket(new Map())
    setDisplayMode('all')
    setFocusIds(new Set())
    setHiddenIds(new Set())
    setTreeScopeIds(null)
    setMutationTick(0)
    setMutationPatches([])
    warehouseRestored.current = false
    setWarehouse((current) => {
      closeBimDatabase(current)
      return null
    })
    setReportFilter(EMPTY_REPORT_FILTER)
    setFollowViewer(true)
    void recycleCsvProcessor()
    hoverBindRef.current?.(null)
    setSpec(EMPTY_QUERY)
    setFilterRules([])
    setFilterColorize(false)
    setFilterNodeKeys([])
    setFilterNodeIds(null)
    setStoreFilterTree([])
    setSavedViews([])
    setEstimation(emptyEstimation())
    setSelectedBoqId(null)
    setEstimationStoreTree([])
    setActiveViewId(null)
    setExportingViewId(null)
    setIfcGantt(null)
    setImportedGantt(null)
    setSelectedTaskId(null)
    setSimDate(null)
    setScheduleOpen(false)
    setBottomTab('schedule')
    setSelectedAssemblyId(null)
    setLeftTab('tree')
    setRightTab('properties')

    let lastProgressAt = 0
    const onProgress = (next: LoadProgress) => {
      if (loadGen.current !== gen) return
      const now = performance.now()
      if (next.phase === 'geometry' && now - lastProgressAt < 120 && next.processed < (next.total || Number.MAX_SAFE_INTEGER)) {
        return
      }
      lastProgressAt = now
      setProgress(next)
    }

    try {
      const next = await loadIfcModel(
        source,
        onProgress,
        (batch) => {
          if (loadGen.current !== gen) return
          geometryStore.append(batch)
        },
      )
      if (loadGen.current !== gen) return
      setResult(next)
      setGeometryGen((tick) => tick + 1)
      setFitToken((token) => token + 1)
      if (next.totalMeshes === 0) setSceneReady(true)
      const session = pendingSession.current
      pendingSession.current = null
      if (session && (!session.cacheKey || session.cacheKey === next.cacheKey)) {
        applySession(session)
      }
    } catch (caught) {
      if (loadGen.current !== gen) return
      pendingParse.current = false
      geometryStore.clear()
      setGeometryGen((tick) => tick + 1)
      setResult(null)
      setSceneReady(false)
      const message = caught instanceof Error ? caught.message : String(caught)
      setError(message)
      setHomeOpen(true)
    } finally {
      if (loadGen.current === gen) setBusy(false)
    }
  }, [applySession, geometryStore])

  // Properties/tree parse after triangles are on the GPU. Running it during
  // tessellation (or while Three.js is still creating meshes) is the large-file OOM.
  useEffect(() => {
    if (busy || !sceneReady || !pendingParse.current || !lastLoadSource.current) return
    const source = lastLoadSource.current
    const gen = loadGen.current
    let cancelled = false
    setParsing(true)
    void (async () => {
      try {
        const buffer = await resolveSourceBytes(source)
        if (cancelled || loadGen.current !== gen) return
        pendingParse.current = false
        const nextStore = await buildDataStore(buffer)
        if (cancelled || loadGen.current !== gen) return
        setStore(nextStore)
        setSpatialRoot(buildSpatialTreeFromStore(nextStore))
        try {
          setIfcGantt(extractGanttFromStore(nextStore))
        } catch (caught) {
          console.warn('IFC schedule extract failed', caught)
          setIfcGantt(null)
        }
      } catch (caught) {
        if (!cancelled && loadGen.current === gen) {
          pendingParse.current = false
          console.warn('IFC parser failed', caught)
        }
      } finally {
        if (!cancelled && loadGen.current === gen) setParsing(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [busy, sceneReady, parseTick])

  // Index properties after 3D is interactive. Filters should already have the
  // store when opened. Skip if warehouse.sqlite restored.
  useEffect(() => {
    if (store || warehouse || busy || parsing || warehouseBusy || !sceneReady || !result) return
    if (pendingParse.current || pendingWarehouseRestore.current) return
    const timer = window.setTimeout(() => {
      if (pendingParse.current || pendingWarehouseRestore.current) return
      pendingParse.current = true
      setParseTick((tick) => tick + 1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [store, warehouse, busy, parsing, warehouseBusy, sceneReady, result])

  useEffect(() => {
    if (!scheduleOpen || bottomTab !== 'schedule' || store || parsing || busy || !sceneReady || !result) return
    if (pendingParse.current) return
    pendingParse.current = true
    setParseTick((tick) => tick + 1)
  }, [scheduleOpen, bottomTab, store, parsing, busy, sceneReady, result])

  useEffect(() => {
    if (!sceneReady || !result || store || warehouse) return
    setSpatialRoot(typeTreeFromMeshes(geometryStore.list(), result.fileName))
  }, [sceneReady, result, store, warehouse, geometryStore, geometryGen])

  useEffect(() => {
    if ((rightTab !== 'export' && mobileTab !== 'export') || sourceBytes || !lastLoadSource.current) return
    const gen = loadGen.current
    let cancelled = false
    void resolveSourceBytes(lastLoadSource.current)
      .then((buffer) => {
        if (cancelled || loadGen.current !== gen) return
        setSourceBytes(new Uint8Array(buffer))
      })
      .catch((caught) => {
        if (!cancelled) console.warn('Could not read IFC bytes for export', caught)
      })
    return () => {
      cancelled = true
    }
  }, [rightTab, mobileTab, sourceBytes, result])

  const refreshProjects = useCallback(async () => {
    if (!projectsAvailable()) return
    setProjects(await listProjects())
  }, [])

  const clearViewer = useCallback(() => {
    loadGen.current += 1
    pendingSession.current = null
    pendingWarehouseRestore.current = false
    pendingQuantitiesRestore.current = false
    pendingParse.current = false
    facePositionCache.current.clear()
    warehouseRestored.current = false
    geometryStore.clear()
    hoverBindRef.current?.(null)
    setBusy(false)
    setSceneReady(false)
    setGeometryGen((tick) => tick + 1)
    setParsing(false)
    setWarehouseBusy(false)
    setWarehouseRequested(false)
    setWarehouseProgress(null)
    warehouseBuild.current = false
    setProgress(null)
    setLoadingName(null)
    setError(null)
    setSelectedId(null)
    setSelectedIds(new Set())
    setResult(null)
    setStore(null)
    setSpatialRoot(null)
    setSourceBytes(null)
    setExportMessage(null)
    setQuantities(null)
    setQuantityBusy(false)
    setTakeoffProgress(null)
    setTakeoffScopeKey(null)
    setTakeoffDismissedKey(null)
    takeoffGen.current += 1
    setCalculatedView(false)
    setSelectedFaceId(null)
    setFaceSelectMode(false)
    setFaceBasketExpressId(null)
    setFaceBasket(new Map())
    setDisplayMode('all')
    setFocusIds(new Set())
    setHiddenIds(new Set())
    setTreeScopeIds(null)
    setMutationTick(0)
    setMutationPatches([])
    setWarehouse((current) => {
      closeBimDatabase(current)
      return null
    })
    setReportFilter(EMPTY_REPORT_FILTER)
    setFollowViewer(true)
    setSpec(EMPTY_QUERY)
    setFilterRules([])
    setFilterColorize(false)
    setFilterNodeKeys([])
    setFilterNodeIds(null)
    setStoreFilterTree([])
    setSavedViews([])
    setEstimation(emptyEstimation())
    setSelectedBoqId(null)
    setEstimationStoreTree([])
    setActiveViewId(null)
    setExportingViewId(null)
    setIfcGantt(null)
    setImportedGantt(null)
    setSelectedTaskId(null)
    setSimDate(null)
    setScheduleOpen(false)
    setBottomTab('schedule')
    setSelectedAssemblyId(null)
    setLeftTab('tree')
    setRightTab('properties')
    void recycleCsvProcessor()
  }, [geometryStore])

  const onCreateProject = useCallback(
    async (name: string) => {
      try {
        const snapshot = await createProject(name)
        clearViewer()
        await rememberSnapshot(snapshot, false)
        setHomeOpen(true)
        await refreshProjects()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught))
      }
    },
    [clearViewer, rememberSnapshot, refreshProjects],
  )

  const onCloseProject = useCallback(async () => {
    try {
      if (projectsAvailable() && project && result) {
        const session: ProjectSession = {
          version: 1,
          cacheKey: result.cacheKey,
          fileName: result.fileName,
          selectedIds: [...selectedIds],
          hiddenIds: [...hiddenIds],
          focusIds: [...focusIds],
          treeScopeIds: treeScopeIds ? [...treeScopeIds] : null,
          displayMode,
          leftTab,
          rightTab,
          spec,
          breakdownMode: 'type',
          filterRules,
          reportTemplate,
          reportGroupBy,
          reportMetrics,
          reportFilter,
          followViewer,
          mutations: mutationPatches,
          quantities: persistableQuantities(quantities),
          savedViews,
          estimation,
        }
        await saveProjectSession(session)
      }
    } catch (caught) {
      console.warn('Could not save session before closing', caught)
    }
    try {
      if (projectsAvailable()) await closeProject()
    } catch (caught) {
      console.warn('Could not close project on the host', caught)
    }
    setProject(null)
    clearViewer()
    setHomeOpen(true)
    await refreshProjects()
  }, [
    project,
    result,
    selectedIds,
    hiddenIds,
    focusIds,
    treeScopeIds,
    displayMode,
    leftTab,
    rightTab,
    spec,
    filterRules,
    reportTemplate,
    reportGroupBy,
    reportMetrics,
    reportFilter,
    followViewer,
    mutationPatches,
    quantities,
    savedViews,
    estimation,
    clearViewer,
    refreshProjects,
  ])

  const onDeleteProject = useCallback(
    async (id: string) => {
      const item = projects.find((row) => row.id === id) ?? (project?.id === id ? project : null)
      const name = item?.name ?? 'this project'
      if (!window.confirm(`Delete “${name}”? The project folder is removed from disk and cannot be undone.`)) {
        return
      }
      try {
        if (project?.id === id) {
          try {
            if (projectsAvailable()) await closeProject()
          } catch (caught) {
            console.warn('Could not close project before delete', caught)
          }
          setProject(null)
          clearViewer()
          setHomeOpen(true)
        }
        await deleteProject(id)
        await refreshProjects()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught))
      }
    },
    [projects, project, clearViewer, refreshProjects],
  )

  const onOpenProject = useCallback(
    async (id: string) => {
      try {
        const snapshot = await openProject(id)
        await rememberSnapshot(snapshot)
        await refreshProjects()
        if (snapshot.modelPath) {
          await load({
            kind: 'path',
            name: snapshot.fileName ?? 'model.ifc',
            path: snapshot.modelPath,
            cacheKey: snapshot.cacheKey ?? undefined,
            skipParse: snapshot.hasWarehouse,
          })
          setHomeOpen(false)
        } else {
          setHomeOpen(true)
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught))
        setHomeOpen(true)
      }
    },
    [load, rememberSnapshot, refreshProjects],
  )

  const importAndLoad = useCallback(
    async (source: LoadSource) => {
      if (!projectsAvailable()) {
        await load(source)
        return
      }
      if (!project) {
        setError('Create a project first. Models are saved under Documents/IFCLite.')
        setHomeOpen(true)
        return
      }
      pendingSession.current = null
      pendingWarehouseRestore.current = false
      pendingQuantitiesRestore.current = false
      pendingParse.current = false
      warehouseRestored.current = false
      if (source.kind === 'path') {
        const snapshot = await importIfcPath(source.path, source.name)
        await rememberSnapshot(snapshot, false)
        if (!snapshot.modelPath) throw new Error('IFC was copied but the project path is missing.')
        await load({
          kind: 'path',
          name: source.name,
          path: snapshot.modelPath,
          cacheKey: snapshot.cacheKey ?? undefined,
        })
        setHomeOpen(false)
        return
      }
      const snapshot = await importIfcBytes(source.name, source.bytes)
      await rememberSnapshot(snapshot, false)
      if (!snapshot.modelPath) throw new Error('IFC was saved but the project path is missing.')
      await load({
        kind: 'path',
        name: source.name,
        path: snapshot.modelPath,
        cacheKey: snapshot.cacheKey ?? undefined,
      })
      setHomeOpen(false)
    },
    [load, project, rememberSnapshot],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const root = await getProjectsRoot()
        if (cancelled) return
        setDesktopHost(true)
        setProjectsRoot(root)
        setProjects(await listProjects())
        setHomeOpen(true)
      } catch {
        if (cancelled) return
        setDesktopHost(false)
        setHomeOpen(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const onOpen = useCallback(async () => {
    try {
      const source = await pickIfcFile()
      if (source) await importAndLoad(source)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [importAndLoad])

  const onDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setDragActive(false)
      const file = event.dataTransfer.files[0]
      if (!file) return
      const bytes = new Uint8Array(await file.arrayBuffer())
      await importAndLoad({ kind: 'buffer', name: file.name, bytes })
    },
    [importAndLoad],
  )

  const onSelect = useCallback((expressId: number | null, additive = false) => {
    if (expressId != null) setFollowViewer(true)
    setSelectedIds((current) => {
      const next = applyClickSelection(current, expressId, additive)
      if (expressId == null) {
        if (!additive) setSelectedId(null)
      } else if (next.has(expressId)) {
        setSelectedId(expressId)
      } else {
        const rest = [...next]
        setSelectedId(rest.at(-1) ?? null)
      }
      return next
    })
    if (expressId != null) {
      setMobileTab((tab) => (tab === 'properties' ? tab : 'properties'))
      setRightTab((tab) => (tab === 'properties' ? tab : 'properties'))
    }
  }, [])

  const onSelectScope = useCallback((ids: number[], additive = false) => {
    const nextScope = new Set(ids)
    if (!additive && treeScopeIds != null && setsEqual(treeScopeIds, nextScope)) {
      setTreeScopeIds(null)
      setDisplayMode('all')
      setFocusIds(new Set())
      setSelectedIds(new Set())
      setSelectedId(null)
      return
    }
    setTreeScopeIds((current) => {
      if (!additive || current == null) return nextScope
      const union = new Set(current)
      for (const id of ids) union.add(id)
      return union
    })
    setSelectedIds((current) => {
      if (!additive) return nextScope
      const next = new Set(current)
      for (const id of ids) next.add(id)
      return next
    })
    setSelectedId(ids[0] ?? null)
    setDisplayMode('isolate')
    setFocusIds((current) => {
      if (!additive) return nextScope
      const next = new Set(current)
      for (const id of ids) next.add(id)
      return next
    })
    setMobileTab('properties')
    setRightTab('properties')
  }, [treeScopeIds])

  const onCopySelectedGlobalIds = useCallback((): string[] => {
    if (selectedIds.size === 0) return []
    if (store) {
      return [...selectedIds].map((id) => store.entities.getGlobalId(id)).filter(Boolean)
    }
    if (warehouse) {
      const globalIds = globalIdsByExpressIds(warehouse, [...selectedIds])
      return [...selectedIds].map((id) => globalIds.get(id)).filter((value): value is string => Boolean(value))
    }
    return []
  }, [store, warehouse, selectedIds])

  const onSpecChange = useCallback((next: QuerySpec) => {
    setSpec(next)
    setFilterNodeKeys([])
    setFilterNodeIds(null)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedId(null)
        setSelectedIds(new Set())
        setTreeScopeIds(null)
        if (displayMode === 'isolate') {
          setDisplayMode('all')
          setFocusIds(new Set())
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [displayMode])

  useEffect(() => {
    if (!projectsAvailable() || !project || !result) return
    const timer = window.setTimeout(() => {
      const session: ProjectSession = {
        version: 1,
        cacheKey: result.cacheKey,
        fileName: result.fileName,
        selectedIds: [...selectedIds],
        hiddenIds: [...hiddenIds],
        focusIds: [...focusIds],
        treeScopeIds: treeScopeIds ? [...treeScopeIds] : null,
        displayMode,
        leftTab,
        rightTab,
        spec,
        breakdownMode: 'type',
        filterRules,
        reportTemplate,
        reportGroupBy,
        reportMetrics,
        reportFilter,
        followViewer,
        mutations: mutationPatches,
        quantities: persistableQuantities(quantities),
        savedViews,
        estimation,
      }
      void saveProjectSession(session).catch((caught) => {
        console.warn('Could not save session.json', caught)
      })
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [
    project,
    result,
    selectedIds,
    hiddenIds,
    focusIds,
    treeScopeIds,
    displayMode,
    leftTab,
    rightTab,
    spec,
    filterRules,
    reportTemplate,
    reportGroupBy,
    reportMetrics,
    reportFilter,
    followViewer,
    mutationPatches,
    quantities,
    savedViews,
    estimation,
  ])

  const onViewerSceneReady = useCallback(() => setSceneReady(true), [])
  const empty = !result && !busy
  const heading = useMemo(() => result?.fileName ?? null, [result])
  const selectedMeshes = useMemo(
    () => (selectedIds.size === 0 ? [] : geometryStore.meshesForIds(selectedIds)),
    [geometryStore, geometryGen, selectedIds],
  )
  // A project reopened from warehouse.sqlite has no live parse (store === null) - fall
  // back to a warehouse-backed view so property/attribute edits still have somewhere to
  // read their base values from, instead of silently doing nothing.
  const mutationView = useMemo(() => {
    if (store) return createMutationView(store)
    if (warehouse) return createWarehouseMutationView(warehouse)
    return null
  }, [store, warehouse])
  const warehouseLookup = useMemo(() => {
    if (!warehouse || store) return null
    try {
      return elementLookupFromWarehouse(warehouse)
    } catch (caught) {
      console.warn('Warehouse element lookup failed', caught)
      return null
    }
  }, [warehouse, store, mutationTick])

  useEffect(() => {
    if (!mutationView || mutationPatches.length === 0) return
    for (const patch of mutationPatches) {
      if (patch.kind === 'attribute') mutationView.setAttribute(patch.expressId, patch.name, patch.value)
      else if (patch.pset) mutationView.setProperty(patch.expressId, patch.pset, patch.name, patch.value)
    }
    setMutationTick((tick) => tick + 1)
  }, [mutationView, mutationPatches])

  // Exporting needs a live IfcDataStore (StepExporter's requirement) - a desktop
  // reopen skips that parse for speed, so hydrate it on demand here rather than
  // require it up front. Builds its own throwaway MutablePropertyView instead of
  // waiting on the reactive `mutationView` to catch up, so a freshly-hydrated
  // store's edits are guaranteed applied within this same call.
  const onExportIfc = useCallback(async (scope?: { isolatedIds: number[]; nameHint?: string }) => {
    if (!result) {
      setError('No model loaded to export.')
      return
    }
    setIfcExportBusy(true)
    setError(null)
    try {
      let exportStore = store
      if (!exportStore) {
        if (!lastLoadSource.current) throw new Error('No model source available to export.')
        const buffer = await resolveSourceBytes(lastLoadSource.current)
        exportStore = await buildDataStore(buffer)
        setStore(exportStore)
        setSpatialRoot(buildSpatialTreeFromStore(exportStore))
      }
      const exportView = createMutationView(exportStore)
      for (const patch of mutationPatches) {
        if (patch.kind === 'attribute') exportView.setAttribute(patch.expressId, patch.name, patch.value)
        else if (patch.pset) exportView.setProperty(patch.expressId, patch.pset, patch.name, patch.value)
      }
      const isolated =
        scope?.isolatedIds && scope.isolatedIds.length > 0 ? new Set(scope.isolatedIds) : null
      const exported = exportIfcWithMutations(exportStore, exportView, isolated)
      const baseName = (result.fileName || 'model.ifc').replace(/\.ifc$/i, '')
      const suffix = scope?.nameHint ? `-${viewFileStem(scope.nameHint)}` : '-edited'
      const path = await saveFileDialog({
        title: isolated ? 'Export view as IFC' : 'Export IFC',
        defaultPath: `${baseName}${suffix}.ifc`,
        filters: [{ name: 'IFC', extensions: ['ifc'] }],
      })
      if (!path) return
      await writeIfcFile(path, exported.content)
      const warningNote =
        exported.warnings.length > 0
          ? ` (${exported.warnings.length} warning${exported.warnings.length === 1 ? '' : 's'})`
          : ''
      setExportMessage(
        isolated
          ? `Exported view “${scope?.nameHint ?? 'view'}” (${exported.entityCount} entities) to ${path}${warningNote}`
          : `Exported ${exported.modifiedEntityCount} modified of ${exported.entityCount} entities to ${path}${warningNote}`,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setIfcExportBusy(false)
    }
  }, [result, store, mutationPatches])

  const onSaveView = useCallback(
    (name: string) => {
      const view = createSavedView(name, selectedIds)
      if (!view) {
        setError('Select elements before saving a view.')
        return
      }
      setSavedViews((current) => [...current, view])
      setActiveViewId(view.id)
      setError(null)
    },
    [selectedIds],
  )

  const onShowView = useCallback((view: SavedView) => {
    const ids = new Set(view.ids)
    setSelectedIds(ids)
    setSelectedId(view.ids[0] ?? null)
    setDisplayMode('isolate')
    setFocusIds(ids)
    setHiddenIds(new Set())
    setActiveViewId(view.id)
  }, [])

  const onUpdateView = useCallback(
    (view: SavedView) => {
      const next = replaceSavedViewIds(view, selectedIds)
      if (!next) {
        setError('Select elements before updating a view.')
        return
      }
      setSavedViews((current) => current.map((item) => (item.id === view.id ? next : item)))
      setActiveViewId(view.id)
      setError(null)
    },
    [selectedIds],
  )

  const onExportView = useCallback(
    (view: SavedView) => {
      setExportingViewId(view.id)
      void onExportIfc({ isolatedIds: view.ids, nameHint: view.name }).finally(() => {
        setExportingViewId(null)
      })
    },
    [onExportIfc],
  )

  const onDeleteView = useCallback((view: SavedView) => {
    setSavedViews((current) => current.filter((item) => item.id !== view.id))
    setActiveViewId((current) => (current === view.id ? null : current))
  }, [])

  const scheduleModel = useMemo(() => {
    const model = importedGantt ?? ifcGantt
    if (!model || importedGantt || !store || !model.hasSchedule) return model
    return { ...model, tasks: applyTaskCosts(model.tasks, extractTaskCosts(store)) }
  }, [importedGantt, ifcGantt, store])

  useEffect(() => {
    if (!store || !ifcGantt?.hasSchedule) return
    const needsCalendars = ifcGantt.calendars == null
    if (needsCalendars) {
      setIfcGantt(extractGanttFromStore(store))
      return
    }
    const needsResources = !ifcGantt.productResources
    const needsCost = !ifcGantt.tasks.some((task) => task.cost != null)
    if (!needsResources && !needsCost) return
    const ids = ifcGantt.tasks.flatMap((task) => task.productExpressIds)
    setIfcGantt({
      ...ifcGantt,
      productResources: needsResources ? extractProductResources(store, ids) : ifcGantt.productResources,
      tasks: needsCost ? applyTaskCosts(ifcGantt.tasks, extractTaskCosts(store)) : ifcGantt.tasks,
    })
  }, [store, ifcGantt])

  const onSelectScheduleTask = useCallback((task: GanttTask) => {
    setSelectedTaskId(task.id)
    if (task.productExpressIds.length === 0) return
    const ids = new Set(task.productExpressIds)
    setSelectedIds(ids)
    setSelectedId(task.productExpressIds[0] ?? null)
    setFollowViewer(true)
    setDisplayMode('ghost')
    setFocusIds(ids)
  }, [])

  const onImportSchedule = useCallback(async () => {
    const file = await pickScheduleFile()
    if (!file) return
    const current = importedGantt ?? ifcGantt
    if (current?.hasSchedule) {
      const ok = window.confirm(
        'Replace the schedule in this panel? The IFC file on disk is not changed.',
      )
      if (!ok) return
    }
    try {
      const next = importScheduleFile(file.bytes, file.name)
      setImportedGantt(next)
      setSelectedTaskId(null)
      setSimDate(null)
      setBottomTab('schedule')
      setScheduleOpen(true)
      if (next.warnings.length > 0) {
        console.group('Schedule import warnings')
        for (const warning of next.warnings) console.warn(warning.code, warning.message)
        console.groupEnd()
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [importedGantt, ifcGantt])

  const onReloadIfcSchedule = useCallback(() => {
    setImportedGantt(null)
    setSelectedTaskId(null)
    setSimDate(null)
    if (!store && !pendingParse.current) {
      pendingParse.current = true
      setParseTick((tick) => tick + 1)
    }
  }, [store])

  const loadAssemblies = useCallback(async (path?: string) => {
    const nextPath = path ?? assemblyPathRef.current
    setAssemblyLoading(true)
    try {
      const catalog = await loadCostAssemblyCatalog(nextPath)
      assemblyStampRef.current = catalog.modifiedMs
      setAssemblyCatalog(catalog)
      setAssemblyPath(catalog.sourcePath)
      setAssemblyError(null)
      setSelectedAssemblyId((current) =>
        current && catalog.assemblies.some((item) => item.id === current) ? current : null,
      )
    } catch (caught) {
      setAssemblyCatalog(null)
      setAssemblyError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setAssemblyLoading(false)
    }
  }, [])

  const onOpenAssemblyFile = useCallback(async () => {
    const file = await pickCostAssemblyFile()
    if (!file) return
    setAssemblyLoading(true)
    try {
      const catalog = parsePickedCostAssembly(file)
      assemblyStampRef.current = catalog.modifiedMs
      setAssemblyCatalog(catalog)
      setAssemblyPath(file.path)
      setAssemblyError(null)
      setSelectedAssemblyId(null)
    } catch (caught) {
      setAssemblyCatalog(null)
      setAssemblyError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setAssemblyLoading(false)
    }
  }, [])

  const onSelectAssembly = useCallback((assembly: CostAssembly) => {
    setSelectedAssemblyId(assembly.id)
  }, [])

  const onShowBoq = useCallback((ids: number[]) => {
    if (ids.length === 0) return
    const next = new Set(ids)
    setFollowViewer(true)
    setSimDate(null)
    setSelectedIds(next)
    setSelectedId(ids[0] ?? null)
    setDisplayMode('isolate')
    setFocusIds(next)
    setHiddenIds(new Set())
    setActiveViewId(null)
    setFitToken((token) => token + 1)
  }, [])

  const applyAgentViewer = useCallback((action: ViewerAction) => {
    if (action.kind === 'select') {
      setFollowViewer(true)
      setSelectedIds((current) => {
        const next = action.additive ? new Set(current) : new Set<number>()
        for (const id of action.ids) next.add(id)
        return next
      })
      setSelectedId(action.ids[0] ?? null)
      return
    }
    if (action.kind === 'isolate') {
      if (action.ids.length === 0) return
      const next = new Set(action.ids)
      setFollowViewer(true)
      setSelectedIds(next)
      setSelectedId(action.ids[0] ?? null)
      setDisplayMode(action.mode)
      setFocusIds(next)
      setHiddenIds(new Set())
      setActiveViewId(null)
      setFitToken((token) => token + 1)
      return
    }
    if (action.kind === 'show_all') {
      setDisplayMode('all')
      setFocusIds(new Set())
      setHiddenIds(new Set())
      setTreeScopeIds(null)
      setFilterNodeKeys([])
      setFilterNodeIds(null)
      setSimDate(null)
      return
    }
    setFitToken((token) => token + 1)
  }, [])
  applyAgentViewerRef.current = applyAgentViewer

  const searchElementsForAgent = useCallback(
    (input: PropertySearchInput) =>
      searchModelElements({
        warehouse,
        store,
        meshes: geometryStore.list(),
        input,
      }),
    [warehouse, store, geometryStore],
  )
  searchElementsRef.current = searchElementsForAgent

  useEffect(() => {
    if (!ESTIMATION_ENABLED || !result) return
    void loadAssemblies()
  }, [result, loadAssemblies])

  useEffect(() => {
    if (!scheduleOpen || bottomTab !== 'assemblies' || !isDesktopShell()) return
    const timer = window.setInterval(() => {
      void (async () => {
        const stat = await statLocalFile(assemblyPathRef.current)
        if (!stat.exists || !stat.modifiedMs) return
        if (stat.modifiedMs !== assemblyStampRef.current) void loadAssemblies()
      })()
    }, 2500)
    return () => window.clearInterval(timer)
  }, [scheduleOpen, bottomTab, loadAssemblies])

  useEffect(() => {
    if (!isDesktopShell() || !project) {
      setMcp(null)
      void stopMcpHost()
      return
    }
    const snapshot = project as ProjectSnapshot
    const ifcPath =
      snapshot.modelPath ??
      (snapshot.folderPath ? joinProjectFile(snapshot.folderPath, snapshot.modelFile ?? 'model.ifc') : null)
    if (!ifcPath) {
      setMcp(null)
      void stopMcpHost()
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const started = await startMcpHost({
          ifcPath,
          catalogPath: assemblyPathRef.current,
          sessionPath: joinProjectFile(snapshot.folderPath, 'session.json'),
          quantitiesPath: joinProjectFile(snapshot.folderPath, 'quantities.json'),
        })
        if (cancelled) {
          await stopMcpHost()
          return
        }
        mcpRevision.current = 0
        setMcp({
          url: started.url,
          token: started.token,
          syncPort: started.syncPort,
          ready: false,
          error: null,
        })
        const health = await waitForMcpReady(started.syncPort, started.token)
        if (cancelled) return
        setMcp((current) =>
          current
            ? { ...current, ready: health.ready, error: health.error }
            : current,
        )
      } catch (caught) {
        if (cancelled) return
        const message = caught instanceof Error ? caught.message : String(caught)
        setMcp({
          url: 'http://127.0.0.1:8765',
          token: '',
          syncPort: 8766,
          ready: false,
          error: message,
        })
      }
    })()
    return () => {
      cancelled = true
      setMcp(null)
      void stopMcpHost()
    }
  }, [project])

  const entity: EntityData | null = useMemo(() => {
    if (selectedId == null) return null
    const type =
      selectedMeshes.find((mesh) => mesh.expressId === selectedId)?.ifcType ??
      store?.entities.getTypeName(selectedId) ??
      warehouseLookup?.get(selectedId)?.ifcType ??
      'IfcProduct'
    const base = readEntity(store, warehouse, selectedId, type)
    void mutationTick
    return mutationView ? overlayEntityData(base, mutationView) : base
  }, [selectedId, selectedMeshes, store, warehouse, warehouseLookup, mutationView, mutationTick])

  const selectedEntities = useMemo(() => {
    void mutationTick
    if (selectedIds.size === 0) return []
    if (selectedIds.size === 1 && entity && selectedIds.has(entity.expressId)) return [entity]
    const typeById = new Map(selectedMeshes.map((mesh) => [mesh.expressId, mesh.ifcType]))
    // Above the threshold, skip the per-entity property/quantity extraction
    // (each call re-parses raw STEP bytes with no cache) and only resolve
    // the cheap, pre-indexed type/name - see MAX_DETAILED_MULTI_SELECT.
    const detailed = selectedIds.size <= MAX_DETAILED_MULTI_SELECT
    return [...selectedIds].map((id) => {
      const type =
        typeById.get(id) ??
        store?.entities.getTypeName(id) ??
        warehouseLookup?.get(id)?.ifcType ??
        'IfcProduct'
      if (!detailed) {
        return {
          expressId: id,
          ifcType: type,
          globalId: '',
          name: store?.entities.getName(id) ?? warehouseLookup?.get(id)?.name ?? '',
          description: '',
          objectType: '',
          tag: '',
          propertySets: [],
          quantitySets: [],
        }
      }
      const base = readEntity(store, warehouse, id, type)
      return mutationView ? overlayEntityData(base, mutationView) : base
    })
  }, [entity, selectedIds, selectedMeshes, store, warehouse, warehouseLookup, mutationView, mutationTick])

  const selectedLabel = useMemo(() => {
    if (selectedIds.size > 1) return `${selectedIds.size} selected`
    if (!entity) return null
    return entity.name ? `${entity.ifcType} (${entity.name})` : `${entity.ifcType} #${entity.expressId}`
  }, [entity, selectedIds])

  useEffect(() => {
    const overlay = overlayFromPatches(mutationPatches)
    hoverLookupRef.current = (id: number) => {
      const cached = warehouseLookup?.get(id)
      const type = store?.entities.getTypeName(id) ?? cached?.ifcType ?? 'IfcProduct'
      const name = overlay.get(overlayAttributeKey(id, 'Name')) || store?.entities.getName(id) || cached?.name
      return name ? `${type} ${name}` : `${type} #${id}`
    }
  }, [store, warehouseLookup, mutationPatches])

  const onHover = useCallback((id: number | null) => {
    hoverBindRef.current?.(id)
  }, [])

  const queryState = useMemo(() => {
    if (!isQueryActive(spec)) {
      return { rows: [], error: null as string | null, ids: null as Set<number> | null }
    }
    try {
      if (warehouse) {
        const rows = queryWarehouse(warehouse, spec)
        return { rows, error: null as string | null, ids: new Set(rows.map((row) => row.expressId)) }
      }
      // STEP extract during parse overlaps 3D and is what takes WebView2 down.
      if (store && !parsing) {
        const rows = executeQuery(store, spec)
        return { rows, error: null as string | null, ids: queryIds(rows) }
      }
      return { rows: [], error: null as string | null, ids: null as Set<number> | null }
    } catch (caught) {
      return {
        rows: [],
        error: caught instanceof Error ? caught.message : String(caught),
        ids: null as Set<number> | null,
      }
    }
  }, [warehouse, store, spec, parsing, reportTick, mutationTick])

  const queryIsolatedIds = queryState.ids
  const groupingUiOpen = leftTab === 'filters' || mobileTab === 'filters'
  const estimationUiOpen = ESTIMATION_ENABLED && scheduleOpen && bottomTab === 'estimation'
  const filterUiOpen = groupingUiOpen || filterColorize

  const filterTree = useMemo(() => {
    if (!filterUiOpen) return []
    if (filterRules.length === 0) return []
    const raw = warehouse
      ? buildWarehousePropertyTree(warehouse, filterRules, spec)
      : (!store || parsing) && filterRules.length === 1 && isIfcTypeRef(filterRules[0])
        ? uniqueIfcTypeTree(geometryStore.list())
        : storeFilterTree
    return filterColorize ? colorizeLeaves(raw) : raw
  }, [
    warehouse,
    store,
    parsing,
    filterRules,
    spec,
    leftTab,
    mobileTab,
    geometryStore,
    geometryGen,
    storeFilterTree,
    filterColorize,
    filterUiOpen,
    reportTick,
    mutationTick,
  ])

  const filterColorMap = useMemo(
    () => (filterColorize ? colorMapFromTree(filterTree) : null),
    [filterColorize, filterTree],
  )

  const isolatedIds = useMemo(
    () => intersectIds(treeScopeIds, filterNodeIds ?? queryIsolatedIds),
    [treeScopeIds, filterNodeIds, queryIsolatedIds],
  )

  const propertyCatalog = useMemo(() => {
    void reportTick
    void mutationTick
    try {
      if (warehouse) return propertyCatalogFromWarehouse(warehouse)
      if (store && !parsing) return propertyCatalogFromLensProvider(createLensProvider(store))
    } catch (caught) {
      console.warn('Property catalog failed', caught)
    }
    return []
  }, [warehouse, store, reportTick, mutationTick, parsing])
  const dataReady = store != null || warehouse != null
  const propertyHint =
    parsing || warehouseBusy
      ? 'Reading IFC properties…'
      : dataReady
        ? null
        : result
          ? 'Indexing properties in the background…'
          : null

  const allExpressIds = useMemo(() => geometryStore.ids().slice(), [geometryStore, geometryGen])

  useEffect(() => {
    if (warehouse) return
    if (leftTab !== 'filters' && mobileTab !== 'filters' && !filterColorize) return
    if (!store || parsing || filterRules.length === 0) {
      setStoreFilterTree([])
      return
    }
    const overlay = overlayFromPatches(mutationPatches)
    const ids = allExpressIds
    const layers = filterRules.map(() => new Map<number, string>())
    let index = 0
    let cancelled = false
    let frame = 0
    const pump = () => {
      if (cancelled) return
      const end = Math.min(index + STORE_PROPERTY_CHUNK, ids.length)
      for (let ruleIndex = 0; ruleIndex < filterRules.length; ruleIndex += 1) {
        labelStorePropertyChunk(store, filterRules[ruleIndex], ids, index, end, layers[ruleIndex], overlay)
      }
      index = end
      setStoreFilterTree(nestByValues(ids.slice(0, index), layers))
      if (index < ids.length) frame = requestAnimationFrame(pump)
    }
    frame = requestAnimationFrame(pump)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [warehouse, store, parsing, filterRules, leftTab, mobileTab, filterColorize, allExpressIds, mutationTick, mutationPatches])

  const estimationSheet = useMemo(() => activeBoq(estimation), [estimation])
  const estimationGroupBy = estimationSheet.groupBy
  useEffect(() => {
    if (warehouse || !estimationUiOpen || estimationGroupBy.length === 0) {
      setEstimationStoreTree((current) => (current.length === 0 ? current : []))
      return
    }
    if (!store || parsing) {
      setEstimationStoreTree((current) => (current.length === 0 ? current : []))
      return
    }
    const overlay = overlayFromPatches(mutationPatches)
    const ids = allExpressIds
    const layers = estimationGroupBy.map(() => new Map<number, string>())
    let index = 0
    let cancelled = false
    let frame = 0
    const pump = () => {
      if (cancelled) return
      const end = Math.min(index + STORE_PROPERTY_CHUNK, ids.length)
      for (let ruleIndex = 0; ruleIndex < estimationGroupBy.length; ruleIndex += 1) {
        labelStorePropertyChunk(store, estimationGroupBy[ruleIndex], ids, index, end, layers[ruleIndex], overlay)
      }
      index = end
      setEstimationStoreTree(nestByValues(ids.slice(0, index), layers))
      if (index < ids.length) frame = requestAnimationFrame(pump)
    }
    frame = requestAnimationFrame(pump)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [
    warehouse,
    store,
    parsing,
    estimationUiOpen,
    estimationGroupBy,
    allExpressIds,
    mutationTick,
    mutationPatches,
  ])

  const agentModelOverview = useMemo(
    () => summarizeModelForAgent(result?.fileName ?? null, spatialRoot),
    [result?.fileName, spatialRoot],
  )

  const estimationPreviewTree = useMemo(() => {
    if (!estimationUiOpen || estimationGroupBy.length === 0) return []
    if (warehouse) return buildWarehousePropertyTree(warehouse, estimationGroupBy, spec)
    if ((!store || parsing) && estimationGroupBy.length === 1 && isIfcTypeRef(estimationGroupBy[0])) {
      return uniqueIfcTypeTree(geometryStore.list())
    }
    return estimationStoreTree
  }, [
    estimationUiOpen,
    estimationGroupBy,
    warehouse,
    store,
    parsing,
    spec,
    estimationStoreTree,
    geometryStore,
    geometryGen,
    reportTick,
    mutationTick,
  ])

  const onBuildEstimation = useCallback(() => {
    setEstimation((current) =>
      mapActiveBoq(current, (boq) => ({
        ...boq,
        root: rebuildBoq(estimationPreviewTree, boq.root),
      })),
    )
  }, [estimationPreviewTree])

  const onBindImportedBoq = useCallback((boq: BoqDoc) => {
    const refs = collectLinkProperties(boq)
    if (refs.length === 0) return { boq, mappedLines: 0, mappedElements: 0 }
    const labelsByProperty = new Map<string, Map<number, string>>()
    if (warehouse) {
      const scope = warehouseScopeIds(warehouse, spec)
      for (const ref of refs) {
        labelsByProperty.set(propertyRefKey(ref), loadValueLabels(warehouse, ref, scope))
      }
    } else if (store && !parsing) {
      const overlay = overlayFromPatches(mutationPatches)
      const ids = allExpressIds
      for (const ref of refs) {
        labelsByProperty.set(propertyRefKey(ref), loadStoreValueLabels(store, ref, ids, overlay))
      }
    } else {
      return { boq, mappedLines: 0, mappedElements: 0 }
    }
    return bindImportedBoq(boq, labelsByProperty)
  }, [warehouse, spec, store, parsing, mutationPatches, allExpressIds])

  useEffect(() => {
    if (!warehouse && !(store && !parsing)) return
    setEstimation((current) => {
      const sheet = activeBoq(current)
      const unbound = flattenBoq(sheet.root).some(
        (node) =>
          node.source === 'import' &&
          node.children.length === 0 &&
          Boolean(node.matchValue || node.assemblyCode) &&
          node.ids.length === 0,
      )
      if (!unbound) return current
      if (!sheet.linkProperty && !flattenBoq(sheet.root).some((node) => node.matchProperty)) return current
      const bound = onBindImportedBoq(sheet)
      if (bound.mappedLines === 0) return current
      return mapActiveBoq(current, () => bound.boq)
    })
  }, [warehouse, store, parsing, onBindImportedBoq])

  const selectedBoq = useMemo(
    () => findBoqNode(estimationSheet.root, selectedBoqId),
    [estimationSheet.root, selectedBoqId],
  )
  const selectedBoqAssembly = useMemo(() => {
    if (!selectedBoq?.assemblyId || !assemblyCatalog) return null
    return assemblyCatalog.assemblies.find((item) => item.id === selectedBoq.assemblyId) ?? null
  }, [selectedBoq, assemblyCatalog])
  const selectedBoqQty = useMemo(() => {
    if (!selectedBoq || !selectedBoqAssembly) return null
    return quantityForIds(selectedBoq.ids, selectedBoqAssembly.uom, quantities).qty
  }, [selectedBoq, selectedBoqAssembly, quantities])

  useEffect(() => {
    if (!mcp?.ready) return
    if (applyingAgentSync.current) return
    const timer = window.setTimeout(() => {
      mcpRevision.current += 1
      void postEstimatorSync(mcp.syncPort, mcp.token, {
        revision: mcpRevision.current,
        estimation,
        selectedIds: [...selectedIds],
        quantities,
        previewTree: estimationPreviewTree,
        catalogPath: assemblyPath,
        catalogSummary: assemblyCatalog
          ? {
              path: assemblyCatalog.sourcePath,
              name: assemblyCatalog.sourceName,
              catalogName: assemblyCatalog.catalogName,
              assemblyCount: assemblyCatalog.assemblies.length,
            }
          : null,
        elementHints: selectedEntities.map((item) => ({
          id: item.expressId,
          ifcType: item.ifcType,
          name: item.name,
        })),
      })
        .then((result) => {
          mcpRevision.current = result.snapshot.revision
          if (!result.accepted) {
            applyingAgentSync.current = true
            setEstimation(result.snapshot.estimation)
            window.setTimeout(() => {
              applyingAgentSync.current = false
            }, 0)
          }
        })
        .catch((caught) => {
          console.warn('MCP sync POST failed', caught)
        })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [
    mcp?.ready,
    mcp?.syncPort,
    estimation,
    selectedIds,
    quantities,
    estimationPreviewTree,
    assemblyPath,
    assemblyCatalog,
    selectedEntities,
  ])

  useEffect(() => {
    if (!mcp?.ready) return
    const timer = window.setInterval(() => {
      void getEstimatorSync(mcp.syncPort, mcp.token)
        .then((snap) => {
          if (snap.pendingTakeoffIds?.length && !quantityBusyRef.current) {
            runTakeoffRef.current(snap.pendingTakeoffIds, `mcp-qto:${snap.pendingTakeoffIds.join(',')}`)
          }
          if (snap.pendingViewer?.length && !viewerBusyRef.current) {
            viewerBusyRef.current = true
            for (const action of snap.pendingViewer) applyAgentViewerRef.current(action)
            void postEstimatorSync(mcp.syncPort, mcp.token, {
              revision: mcpRevision.current,
              consumedViewer: snap.pendingViewer.length,
            })
              .catch(() => undefined)
              .finally(() => {
                viewerBusyRef.current = false
              })
          }
          if (snap.pendingSearch && !searchBusyRef.current) {
            searchBusyRef.current = true
            const result = searchElementsRef.current(snap.pendingSearch)
            void postEstimatorSync(mcp.syncPort, mcp.token, {
              revision: mcpRevision.current,
              searchResults: result,
            })
              .catch(() => undefined)
              .finally(() => {
                searchBusyRef.current = false
              })
          }
          if (snap.origin !== 'agent' || snap.revision <= mcpRevision.current) return
          applyingAgentSync.current = true
          mcpRevision.current = snap.revision
          const preview = estimationPreviewTree
          setEstimation(() => {
            const next = snap.estimation
            const sheet = activeBoq(next)
            if (preview.length > 0 && sheet.groupBy.length > 0) {
              return mapActiveBoq(next, (boq) => ({ ...boq, root: rebuildBoq(preview, boq.root) }))
            }
            return next
          })
          void postEstimatorSync(mcp.syncPort, mcp.token, {
            revision: snap.revision,
            force: true,
            estimation: snap.estimation,
            selectedIds: [...selectedIds],
            quantities,
            previewTree: preview,
            catalogPath: assemblyPath,
          }).catch(() => undefined)
          window.setTimeout(() => {
            applyingAgentSync.current = false
          }, 0)
        })
        .catch(() => undefined)
    }, 500)
    return () => window.clearInterval(timer)
  }, [mcp?.ready, mcp?.syncPort, estimationPreviewTree, selectedIds, quantities, assemblyPath])
  const measureBoqIfc = useCallback(
    (ref: PropertyRef) => {
      if (!warehouse || !selectedBoq) return 0
      return sumNumericValues(warehouse, ref, selectedBoq.ids)
    },
    [warehouse, selectedBoq],
  )
  const measureBoqIfcIds = useCallback(
    (ids: number[], ref: PropertyRef) => {
      if (!warehouse) return 0
      return sumNumericValues(warehouse, ref, ids)
    },
    [warehouse],
  )
  const onBindBuildUpQty = useCallback(
    (rowId: string, binding: QtyBinding) => {
      if (!selectedBoqAssembly) return
      const key = qtyBindingKey(selectedBoqAssembly.id, rowId)
      setEstimation((current) =>
        mapActiveBoq(current, (boq) => ({
          ...boq,
          qtyBindings: { ...(boq.qtyBindings ?? {}), [key]: binding },
        })),
      )
    },
    [selectedBoqAssembly],
  )
  const onExcludedBuildUpChange = useCallback((excludedLines: Record<string, boolean>) => {
    setEstimation((current) => mapActiveBoq(current, (boq) => ({ ...boq, excludedLines })))
  }, [])
  const onParameterOverrideChange = useCallback((code: string, value: string) => {
    if (!selectedBoqAssembly) return
    setEstimation((current) =>
      mapActiveBoq(current, (boq) => ({
        ...boq,
        parameterOverrides: setParameterOverride(boq.parameterOverrides ?? {}, selectedBoqAssembly.id, code, value),
      })),
    )
  }, [selectedBoqAssembly])
  const onParamBindingChange = useCallback((code: string, binding: ParamBinding) => {
    if (!selectedBoqAssembly) return
    setEstimation((current) =>
      mapActiveBoq(current, (boq) => ({
        ...boq,
        parameterBindings: setParamBinding(boq.parameterBindings ?? {}, selectedBoqAssembly.id, code, binding),
      })),
    )
  }, [selectedBoqAssembly])

  const buildUpEmptyHint = selectedBoq
    ? 'Assign an assembly on this BOQ line to see labour, material and plant.'
    : 'Select a BOQ line to see the assembly cost build-up.'

  const onPopOutBuildUp = useCallback(() => {
    setBuildupPopped(true)
    void openPaneWindow('buildup')
  }, [])

  useEffect(() => {
    let unlistenAction: (() => void) | null = null
    let unlistenClosed: (() => void) | null = null
    onPaneAction<BuildUpPaneAction>('buildup', (action) => {
      if (action.type === 'bind') onBindBuildUpQty(action.rowId, action.binding)
      else if (action.type === 'excluded') onExcludedBuildUpChange(action.excluded)
      else if (action.type === 'parameter') onParameterOverrideChange(action.code, action.value)
      else if (action.type === 'paramBinding') onParamBindingChange(action.code, action.binding)
    }).then((fn) => {
      unlistenAction = fn
    })
    onPaneClosed('buildup', () => setBuildupPopped(false)).then((fn) => {
      unlistenClosed = fn
    })
    return () => {
      unlistenAction?.()
      unlistenClosed?.()
    }
  }, [onBindBuildUpQty, onExcludedBuildUpChange, onParameterOverrideChange, onParamBindingChange])

  useEffect(() => {
    if (!buildupPopped) return
    const state: BuildUpPaneState = {
      assembly: selectedBoqAssembly,
      elementIds: selectedBoq?.ids ?? [],
      assemblyQty: selectedBoqQty ?? null,
      quantities,
      propertyCatalog,
      bindings: estimationSheet.qtyBindings ?? {},
      excludedLines: estimationSheet.excludedLines ?? {},
      parameterOverrides: estimationSheet.parameterOverrides ?? {},
      parameterBindings: estimationSheet.parameterBindings ?? {},
      emptyHint: buildUpEmptyHint,
    }
    void broadcastPaneState('buildup', state)
  }, [
    buildupPopped,
    selectedBoqAssembly,
    selectedBoq,
    selectedBoqQty,
    quantities,
    propertyCatalog,
    estimationSheet.qtyBindings,
    estimationSheet.excludedLines,
    estimationSheet.parameterOverrides,
    estimationSheet.parameterBindings,
    buildUpEmptyHint,
  ])

  const selectedElementCost = useMemo(() => {
    if (!estimationUiOpen || selectedIds.size !== 1) return null
    const id = [...selectedIds][0]
    const node = findBoqLeafForElement(estimationSheet.root, id)
    if (!node?.assemblyId || !assemblyCatalog) return null
    const assembly = assemblyCatalog.assemblies.find((item) => item.id === node.assemblyId)
    if (!assembly) return null
    const [build] = elementBuildUps({
      rows: buildUpRows(assembly.details),
      ids: [id],
      assemblyId: assembly.id,
      assemblyUom: assembly.uom,
      bindings: estimationSheet.qtyBindings ?? {},
      excluded: estimationSheet.excludedLines ?? {},
      quantities,
      measureIfc: measureBoqIfcIds,
      shareCount: node.ids.length,
      assembly,
      parameterOverrides: estimationSheet.parameterOverrides,
      parameterBindings: estimationSheet.parameterBindings,
      propertyCatalog,
    })
    if (!build) return null
    return {
      label: `${elementTreeLabel(store, id, warehouseLookup?.get(id)?.ifcType)} #${id}`,
      node,
      assembly,
      build,
    }
  }, [
    assemblyCatalog,
    estimationSheet.excludedLines,
    estimationSheet.parameterBindings,
    estimationSheet.parameterOverrides,
    estimationSheet.qtyBindings,
    estimationSheet.root,
    estimationUiOpen,
    measureBoqIfcIds,
    propertyCatalog,
    quantities,
    selectedIds,
    store,
    warehouseLookup,
  ])

  const simWindows = useMemo(
    () => (scheduleModel?.hasSchedule ? productWindows(scheduleModel.tasks) : null),
    [scheduleModel],
  )
  const simLook = useMemo(() => {
    if (!simDate || !simWindows) return null
    return simulateAt(simWindows, allExpressIds, simDate)
  }, [simDate, simWindows, allExpressIds])
  const simColorMap = useMemo(() => {
    if (!simLook) return null
    const map = new Map<number, [number, number, number, number]>()
    for (const id of simLook.active) {
      map.set(id, activityTint(simLook.activityOf.get(id) ?? 'Activity', false))
    }
    for (const id of simLook.done) {
      map.set(id, activityTint(simLook.activityOf.get(id) ?? 'Activity', true))
    }
    return map
  }, [simLook])
  const simIsolateIds = useMemo(() => {
    if (!simLook) return null
    const ids = new Set(simLook.done)
    for (const id of simLook.active) ids.add(id)
    return ids
  }, [simLook])
  const viewIsolateIds = simIsolateIds ?? (displayMode === 'isolate' ? focusIds : null)
  const ghostIds = useMemo(() => {
    if (simLook) return EMPTY_EXPRESS_IDS
    return ghostExpressIds(displayMode, focusIds, allExpressIds, isolatedIds, hiddenIds)
  }, [simLook, displayMode, focusIds, allExpressIds, isolatedIds, hiddenIds])
  const visibleIds = useMemo(
    () =>
      visibleExpressIds(
        allExpressIds,
        isolatedIds,
        displayMode === 'isolate' ? focusIds : null,
        hiddenIds,
      ),
    [allExpressIds, isolatedIds, displayMode, focusIds, hiddenIds],
  )

  const onShowAll = useCallback(() => {
    setDisplayMode('all')
    setFocusIds(new Set())
    setHiddenIds(new Set())
    setTreeScopeIds(null)
    setFilterNodeKeys([])
    setFilterNodeIds(null)
    setSimDate(null)
  }, [])

  // The desktop app's packed geometry transport doesn't carry a per-mesh
  // ifcType (dropped from the binary shard for size), so resolving "which
  // rendered elements are openings/spaces" has to go through the same
  // type lookup the Properties panel uses, keyed by expressId.
  const hiddenTypeIds = useMemo(() => {
    const next = new Set<number>()
    if (showOpenings && showSpaces) return next
    for (const id of allExpressIds) {
      const type = store?.entities.getTypeName(id) ?? warehouseLookup?.get(id)?.ifcType
      if (!type) continue
      if (!showOpenings && OPENING_IFC_TYPES.has(type)) next.add(id)
      else if (!showSpaces && SPATIAL_IFC_TYPES.has(type)) next.add(id)
    }
    return next
  }, [allExpressIds, store, warehouseLookup, showOpenings, showSpaces])

  const onHideSelected = useCallback(() => {
    if (selectedIds.size === 0) return
    setHiddenIds((current) => {
      const next = new Set(current)
      for (const id of selectedIds) next.add(id)
      return next
    })
    const nextFocus = new Set(focusIds)
    for (const id of selectedIds) nextFocus.delete(id)
    setFocusIds(nextFocus)
    if (nextFocus.size === 0) setDisplayMode('all')
    setSelectedId(null)
    setSelectedIds(new Set())
  }, [focusIds, selectedIds])

  const onGhostSelected = useCallback(() => {
    if (selectedIds.size === 0) return
    if (displayMode === 'ghost' && setsEqual(focusIds, selectedIds)) {
      if (filterNodeIds) return
      setDisplayMode('all')
      setFocusIds(new Set())
      return
    }
    setDisplayMode('ghost')
    setFocusIds(new Set(selectedIds))
  }, [displayMode, focusIds, selectedIds, filterNodeIds])

  const onIsolateSelected = useCallback(() => {
    if (selectedIds.size === 0) return
    if (displayMode === 'isolate' && setsEqual(focusIds, selectedIds)) {
      if (filterNodeIds) {
        setDisplayMode('ghost')
        return
      }
      setDisplayMode('all')
      setFocusIds(new Set())
      setFitToken((token) => token + 1)
      return
    }
    setDisplayMode('isolate')
    setFocusIds(new Set(selectedIds))
    setFitToken((token) => token + 1)
  }, [displayMode, focusIds, selectedIds, filterNodeIds])

  const onSelectIsolated = useCallback(() => {
    if (!viewIsolateIds || viewIsolateIds.size === 0) return
    setSelectedIds(new Set(viewIsolateIds))
    setSelectedId([...viewIsolateIds].at(-1) ?? null)
    setFollowViewer(true)
    setMobileTab((tab) => (tab === 'properties' ? tab : 'properties'))
    setRightTab((tab) => (tab === 'properties' ? tab : 'properties'))
  }, [viewIsolateIds])

  const meshStats = useMemo(
    () => ({
      meshCount: selectedMeshes.length,
      vertices: selectedMeshes.reduce((sum, mesh) => sum + mesh.positions.length / 3, 0),
      triangles: selectedMeshes.reduce((sum, mesh) => sum + mesh.indices.length / 3, 0),
    }),
    [selectedMeshes],
  )

  // Overlay only the current selection (or isolate set). Whole-model face meshes
  // would stall the viewer even though the numbers themselves are already cached.
  const overlayFaces = useMemo(() => {
    if (!calculatedView || !quantities) return null
    const scope = selectedIds.size > 0 ? selectedIds : viewIsolateIds
    if (!scope || scope.size === 0) return null
    const faces = quantities.elements
      .filter((item) => scope.has(item.expressId))
      .flatMap((item) => {
        const cached = facePositionCache.current.get(item.expressId)
        const hydrated = cached ?? hydrateFacePositions(item, geometryStore.list())
        if (!cached) facePositionCache.current.set(item.expressId, hydrated)
        return hydrated.faces
      })
    return faces.length > 0 ? faces : null
  }, [calculatedView, quantities, selectedIds, viewIsolateIds, geometryStore, geometryGen])

  useEffect(() => {
    if (!overlayFaces) setSelectedFaceId(null)
  }, [overlayFaces])

  const onSelectFace = useCallback((faceId: string | null) => {
    setSelectedFaceId((current) => (current === faceId ? null : faceId))
  }, [])

  const selectedQuantityRows = useMemo(() => {
    if (!quantities || selectedIds.size === 0) return []
    return quantities.elements.filter((item) => selectedIds.has(item.expressId))
  }, [quantities, selectedIds])

  const computedMetrics = useMemo(() => {
    if (selectedQuantityRows.length === 0) return null
    const [first, ...rest] = selectedQuantityRows
    const acc = { ...first.metrics }
    for (const row of rest) {
      acc.AREAMAX += row.metrics.AREAMAX
      acc.AREAMIN += row.metrics.AREAMIN
      acc.LATERALAREA += row.metrics.LATERALAREA
      acc.UNDERAREA += row.metrics.UNDERAREA
      acc.TOPAREA += row.metrics.TOPAREA
      acc.GROSSAREA += row.metrics.GROSSAREA
      acc.COVEREDAREA += row.metrics.COVEREDAREA
      acc.UNCOVEREDAREA += row.metrics.UNCOVEREDAREA
      acc.CROSSAREA += row.metrics.CROSSAREA
      acc.FOOTPRINTAREA += row.metrics.FOOTPRINTAREA
      acc.VOLUME += row.metrics.VOLUME
      acc.LENGTH += row.metrics.LENGTH
      acc.WIDTH += row.metrics.WIDTH
      acc.HEIGHT += row.metrics.HEIGHT
      acc.COUNT += row.metrics.COUNT
    }
    return acc
  }, [selectedQuantityRows])

  const onOpenQuantities = useCallback(() => {
    setRightTab('quantities')
    setMobileTab('quantities')
  }, [])

  const persistQuantities = useCallback(
    (next: QuantityResult) => {
      if (!projectsAvailable() || !project || !result) return
      void saveProjectQuantities(encodeStoredQuantities(result.cacheKey, next)).catch((caught) => {
        console.warn('Could not save quantities.json', caught)
      })
    },
    [project, result],
  )

  quantitiesRef.current = quantities

  const takeoffTarget = useMemo(
    () =>
      resolveTakeoffTarget({
        specType: spec.typeScope,
        specStorey: spec.storeyId,
        filterPropertyKey: filterRules.length > 0 ? filterRules.map(propertyRefKey).join('+') : null,
        filterNodeKey: filterNodeKeys.length > 0 ? filterNodeKeys.join('||') : null,
        filterIds: filterNodeIds ? [...filterNodeIds] : null,
        breakdownRuleKeys: [],
        breakdownNodeKey: null,
        breakdownIds: null,
        selectedIds: [...selectedIds],
      }),
    [
      spec.typeScope,
      spec.storeyId,
      filterRules,
      filterNodeKeys,
      filterNodeIds,
      selectedIds,
    ],
  )
  const takeoffMissing = useMemo(
    () => missingTakeoffIds(takeoffTarget.ids, quantities?.elements.map((item) => item.expressId) ?? []),
    [takeoffTarget.ids, quantities],
  )
  const takeoffStale = Boolean(
    quantities &&
      takeoffScopeKey &&
      takeoffTarget.key &&
      takeoffTarget.key !== takeoffScopeKey &&
      takeoffTarget.key !== takeoffDismissedKey,
  )

  const cancelTakeoff = useCallback(() => {
    takeoffGen.current += 1
    setQuantityBusy(false)
    setTakeoffProgress(null)
  }, [])

  const runTakeoff = useCallback(
    (ids: number[], key: string, options?: { openPanel?: boolean }) => {
      if (ids.length === 0) return
      const gen = takeoffGen.current + 1
      takeoffGen.current = gen
      if (options?.openPanel !== false) {
        setRightTab('quantities')
        setMobileTab('quantities')
      }
      setCalculatedView(true)
      setTakeoffScopeKey(key)
      setTakeoffDismissedKey(null)
      const unique = [...new Set(ids)]
      const have = new Set(quantitiesRef.current?.elements.map((item) => item.expressId) ?? [])
      const missing = unique.filter((id) => !have.has(id))
      if (missing.length === 0) {
        setQuantityBusy(false)
        setTakeoffProgress(null)
        return
      }
      setQuantityBusy(true)
      setTakeoffProgress({ done: unique.length - missing.length, total: unique.length })
      void (async () => {
        let acc = quantitiesRef.current
        let done = unique.length - missing.length
        try {
          for (let index = 0; index < missing.length; index += TAKEOFF_CHUNK) {
            if (takeoffGen.current !== gen) return
            await new Promise<void>((resolve) => {
              if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
              else setTimeout(resolve, 0)
            })
            if (takeoffGen.current !== gen) return
            const chunk = missing.slice(index, index + TAKEOFF_CHUNK)
            const idsToMeasure = new Set(chunk)
            const subset = geometryStore.quantitySubset(idsToMeasure)
            if (subset.length > 0) {
              const typed = typeQtoMeshes(subset, (expressId) => {
                return store?.entities.getTypeName(expressId) ?? warehouseLookup?.get(expressId)?.ifcType
              })
              const part = computeElementQuantities(typed, { targetIds: idsToMeasure, keepPositions: false })
              acc = mergeQuantityElements([...(acc?.elements ?? []), ...part.elements])
              quantitiesRef.current = acc
              setQuantities(acc)
            }
            done += chunk.length
            setTakeoffProgress({ done, total: unique.length })
          }
          if (takeoffGen.current !== gen) return
          if (acc) persistQuantities(acc)
        } catch (caught) {
          if (takeoffGen.current === gen) {
            console.warn('Surface takeoff for the selection failed', caught)
            setError(caught instanceof Error ? caught.message : String(caught))
          }
        } finally {
          if (takeoffGen.current === gen) {
            setQuantityBusy(false)
            setTakeoffProgress(null)
          }
        }
      })()
    },
    [geometryStore, store, warehouseLookup, persistQuantities],
  )
  runTakeoffRef.current = runTakeoff
  quantityBusyRef.current = quantityBusy

  const ensureAgentTakeoff = useCallback(async (ids: number[]) => {
    runTakeoff(ids, `agent:${ids.join(',')}`)
    const started = Date.now()
    while (Date.now() - started < 60_000) {
      const have = new Set(quantitiesRef.current?.elements.map((item) => item.expressId) ?? [])
      if (ids.every((id) => have.has(id))) return
      await new Promise((resolve) => window.setTimeout(resolve, 200))
    }
  }, [runTakeoff])

  const getElementFaces = useCallback(
    (expressId: number): ElementQuantity | null => {
      const hit = facePositionCache.current.get(expressId)
      if (hit) return hit
      const row = quantities?.elements.find((item) => item.expressId === expressId)
      if (row) {
        const hydrated = hydrateFacePositions(row, geometryStore.list())
        facePositionCache.current.set(expressId, hydrated)
        return hydrated
      }
      try {
        const ids = new Set([expressId])
        const subset = geometryStore.quantitySubset(ids)
        if (subset.length === 0) return null
        const typed = typeQtoMeshes(subset, (id) => {
          return store?.entities.getTypeName(id) ?? warehouseLookup?.get(id)?.ifcType
        })
        const part = computeElementQuantities(typed, { targetIds: ids, keepPositionsFor: ids })
        const element = part.elements.find((item) => item.expressId === expressId) ?? null
        if (!element) return null
        facePositionCache.current.set(expressId, element)
        const compact = {
          ...element,
          faces: element.faces.map((face) => ({ ...face, positions: [] as number[] })),
        }
        const next = mergeQuantityElements([...(quantities?.elements ?? []), compact])
        setQuantities(next)
        persistQuantities(next)
        return element
      } catch (caught) {
        console.warn('Could not read faces for element', expressId, caught)
        return null
      }
    },
    [quantities, geometryStore, store, warehouseLookup, persistQuantities],
  )

  const onFaceCandidate = useCallback(
    (info: { expressId: number; point: [number, number, number]; normal: [number, number, number] } | null) => {
      if (!faceSelectMode || !info) return
      const element = getElementFaces(info.expressId)
      if (!element) return
      const face = matchFaceAtPoint(element.faces, info.point, info.normal)
      if (!face) return
      if (faceBasketExpressId !== null && faceBasketExpressId !== info.expressId) {
        setFaceBasketExpressId(info.expressId)
        setFaceBasket(new Map([[face.faceId, face]]))
        return
      }
      setFaceBasketExpressId(info.expressId)
      setFaceBasket((prev) => {
        const next = new Map(prev)
        if (next.has(face.faceId)) next.delete(face.faceId)
        else next.set(face.faceId, face)
        return next
      })
    },
    [faceSelectMode, faceBasketExpressId, getElementFaces],
  )

  const faceBasketList = useMemo(() => [...faceBasket.values()], [faceBasket])

  const onClearFaceBasket = useCallback(() => {
    setFaceBasket(new Map())
    setFaceBasketExpressId(null)
  }, [])

  const onRegisterFaceBasket = useCallback(
    (rawName: string) => {
      if (!mutationView || faceBasketExpressId == null || faceBasketList.length === 0) return
      const name = sanitizePropertyName(rawName)
      if (!name) {
        setError('Type a property name before registering the selected faces.')
        return
      }
      let net = 0
      for (const face of faceBasketList) net += face.netArea
      const netValue = net.toFixed(3)
      const pset = 'Qto_Manual'
      mutationView.setProperty(faceBasketExpressId, pset, name, netValue)
      const next = mutationPatchesRef.current.filter(
        (patch) =>
          !(
            patch.expressId === faceBasketExpressId &&
            patch.kind === 'property' &&
            patch.pset === pset &&
            patch.name === name
          ),
      )
      next.push({ expressId: faceBasketExpressId, kind: 'property', pset, name, value: netValue })
      publishMutations(next)
      setError(null)
      onClearFaceBasket()
    },
    [mutationView, faceBasketExpressId, faceBasketList, onClearFaceBasket, publishMutations],
  )

  // Quantity module: never part of 3D start. Restore/compute only when the user
  // opens quantities, calculated view, or face pick.
  useEffect(() => {
    if (busy || !sceneReady || !result) return
    if (!calculatedView && rightTab !== 'quantities' && mobileTab !== 'quantities' && !faceSelectMode) return
    if (quantities) return
    if (!pendingQuantitiesRestore.current) return
    let cancelled = false
    void getProjectQuantities().then((json) => {
      if (cancelled) return
      pendingQuantitiesRestore.current = false
      if (!json || json.length > MAX_RESTORED_QUANTITIES_CHARS) {
        if (json && json.length > MAX_RESTORED_QUANTITIES_CHARS) {
          console.warn('Skipping quantities.json because it is too large for the viewer')
        }
        return
      }
      const restored = parseStoredQuantities(json, result.cacheKey)
      if (restored && isCompleteTakeoff(restored)) setQuantities(restored)
    })
    return () => {
      cancelled = true
    }
  }, [busy, sceneReady, result, quantities, calculatedView, rightTab, mobileTab, faceSelectMode])

  const onToggleCalculatedView = useCallback(() => {
    setCalculatedView((value) => !value)
  }, [])

  const quantitySummary = useMemo(() => {
    if (quantityBusy && takeoffProgress) {
      return `Measuring ${takeoffProgress.done} / ${takeoffProgress.total}`
    }
    if (!quantities || selectedIds.size === 0) return null
    const picked = quantities.elements.filter((item) => selectedIds.has(item.expressId))
    if (picked.length === 0) return null
    const lateral = picked.reduce((sum, item) => sum + item.metrics.LATERALAREA, 0)
    const net = picked.reduce((sum, item) => sum + item.metrics.GROSSAREA, 0)
    return `LATERAL ${lateral.toFixed(2)} · GROSS ${net.toFixed(2)} m²`
  }, [quantities, selectedIds, quantityBusy, takeoffProgress])

  const reportBusy = warehouseRequested && !warehouse
  const reportScope = followViewer && selectedIds.size > 0 ? selectedIds : isolatedIds
  const reportOptions: FilterOptions | null = useMemo(() => {
    if (!warehouse || !warehouseRequested) return null
    void reportTick
    return loadFilterOptions(warehouse)
  }, [warehouse, reportTick, warehouseRequested])
  const report: ReportResult | null = useMemo(() => {
    if (!warehouse || !warehouseRequested) return null
    void reportTick
    try {
      return runReport(warehouse, reportTemplate, reportFilter, reportGroupBy, reportMetrics, reportScope)
    } catch (caught) {
      console.warn('Report query failed', caught)
      return null
    }
  }, [warehouse, reportTick, reportTemplate, reportFilter, reportGroupBy, reportMetrics, reportScope, warehouseRequested])

  const onReportRow = useCallback(
    (row: ReportRow) => {
      if (!warehouse) return
      setFollowViewer(false)
      const ids =
        reportTemplate === 'qa'
          ? queryQaIds(warehouse, reportFilter, row.key)
          : queryElementIds(warehouse, reportFilter, reportTemplate === 'progress' ? 'status' : reportGroupBy, row.key)
      if (ids.length === 0) return
      setSelectedIds(new Set(ids))
      setSelectedId(ids[0] ?? null)
      setDisplayMode('isolate')
      setFocusIds(new Set(ids))
      setRightTab('dashboard')
      setMobileTab('dashboard')
    },
    [warehouse, reportTemplate, reportFilter, reportGroupBy],
  )

  const onReportExport = useCallback(
    (format: 'csv' | 'json' | 'xlsx') => {
      if (!report) return
      const base = (heading ?? 'model').replace(/\.(ifc|ifczip)$/i, '')
      if (format === 'json') {
        downloadTextFile(`${base}-${report.template}.json`, reportToJson(report), 'application/json')
      } else if (format === 'csv') {
        downloadTextFile(`${base}-${report.template}.csv`, reportToCsv(report), 'text/csv;charset=utf-8')
      } else {
        downloadTextFile(
          `${base}-${report.template}.xls`,
          reportToSpreadsheetXml(report),
          'application/vnd.ms-excel',
        )
      }
      setExportMessage(`Exported ${report.template} report`)
    },
    [report, heading],
  )

  const viewSourceLabel = useMemo(() => {
    if (filterNodeKeys.length === 0) return null
    const propertyIds = unionPropertyNodeIds(filterTree, filterNodeKeys)
    const fromProperty = selectedIds.size === propertyIds.length && propertyIds.every((id) => selectedIds.has(id))
    if (!fromProperty) return null
    return propertySelectionLabel(filterTree, filterNodeKeys, filterRules[filterRules.length - 1]?.name)
  }, [filterNodeKeys, filterTree, filterRules, selectedIds])

  const leftDock = {
    root: spatialRoot,
    store,
    warehouse,
    onCopySelectedGlobalIds,
    selectedId,
    selectedIds,
    isolatedIds,
    parsing,
    onSelect,
    spec,
    matchCount: filterNodeIds?.size ?? null,
    filterError: queryState.error,
    filterReady: Boolean(result && sceneReady),
    filterHint: propertyHint,
    propertyCatalog,
    onSpecChange,
    filterRules,
    filterTree,
    filterNodeKeys,
    onFilterRulesChange: (rules: PropertyRef[]) => {
      setFilterRules(rules)
      setFilterNodeKeys([])
      setFilterNodeIds(null)
      setDisplayMode('all')
      setFocusIds(new Set())
    },
    onSelectFilterValue: (node: PropertyTreeNode | null, additive = false) => {
      if (!node) {
        setFilterNodeKeys([])
        setFilterNodeIds(null)
        setSelectedIds(new Set())
        setSelectedId(null)
        setDisplayMode('all')
        setFocusIds(new Set())
        return
      }
      const nextKeys = toggleFilterKeys(filterNodeKeys, node.key, additive)
      if (nextKeys.length === 0) {
        setFilterNodeKeys([])
        setFilterNodeIds(null)
        setSelectedIds(new Set())
        setSelectedId(null)
        setDisplayMode('all')
        setFocusIds(new Set())
        return
      }
      const ids = new Set(unionPropertyNodeIds(filterTree, nextKeys))
      setFilterNodeKeys(nextKeys)
      setFilterNodeIds(ids)
      setSelectedIds(ids)
      setSelectedId(nextKeys.length === 1 ? (node.ids[0] ?? null) : ([...ids][0] ?? null))
      setFollowViewer(true)
      setDisplayMode('ghost')
      setFocusIds(ids)
    },
    filterColorize,
    onFilterColorizeChange: setFilterColorize,
    onSelectScope,
    reportReady: Boolean(result && sceneReady),
    reportBusy,
    reportProgress: warehouseProgress,
    reportTemplate,
    reportGroupBy,
    reportMetrics,
    reportFilter,
    reportOptions,
    followViewer,
    onReportTemplate: (template: ReportTemplate) => {
      setReportTemplate(template)
      if (template === 'cost') setReportGroupBy('cost_code')
      if (template === 'qto') setReportGroupBy('category')
      if (template === 'progress') setReportGroupBy('status')
      setWarehouseRequested(true)
      setLeftTab('reports')
      setRightTab('dashboard')
      setMobileTab('dashboard')
    },
    onReportGroupBy: setReportGroupBy,
    onReportMetrics: setReportMetrics,
    onReportFilter: setReportFilter,
    onFollowViewer: setFollowViewer,
  }

  const rightDock = {
    entity,
    parsing,
    meshCount: meshStats.meshCount,
    vertices: meshStats.vertices,
    triangles: meshStats.triangles,
    computedMetrics,
    selectionCount: selectedIds.size,
    modelElementCount: allExpressIds.length,
    entities: selectedEntities,
    mutationCount: mutationView?.getModifiedEntityCount() ?? 0,
    onEditAttribute: mutationView
      ? (name: string, value: string) => {
          const next: MutationPatch[] = [...mutationPatches]
          for (const id of selectedIds) {
            mutationView.setAttribute(id, name, value)
            const rest = next.filter((patch) => !(patch.kind === 'attribute' && patch.expressId === id && patch.name === name))
            rest.push({ expressId: id, kind: 'attribute', name, value })
            next.length = 0
            next.push(...rest)
          }
          publishMutations(next)
        }
      : undefined,
    onEditProperty: mutationView
      ? (pset: string, name: string, value: string) => {
          const next: MutationPatch[] = [...mutationPatches]
          for (const id of selectedIds) {
            mutationView.setProperty(id, pset, name, value)
            const rest = next.filter(
              (patch) =>
                !(patch.kind === 'property' && patch.expressId === id && patch.pset === pset && patch.name === name),
            )
            rest.push({ expressId: id, kind: 'property', pset, name, value })
            next.length = 0
            next.push(...rest)
          }
          publishMutations(next)
        }
      : undefined,
    onAddProperty: mutationView
      ? (pset: string, name: string, value: string, scope: 'selected' | 'model') => {
          const targetIds = scope === 'model' ? allExpressIds : [...selectedIds]
          if (targetIds.length === 0) return
          for (const id of targetIds) mutationView.setProperty(id, pset, name, value)
          const key = (patch: MutationPatch) => `${patch.kind}:${patch.expressId}:${patch.pset ?? ''}:${patch.name}`
          const merged = new Map(mutationPatches.map((patch) => [key(patch), patch]))
          for (const id of targetIds) {
            const patch: MutationPatch = { expressId: id, kind: 'property', pset, name, value }
            merged.set(key(patch), patch)
          }
          publishMutations([...merged.values()])
        }
      : undefined,
    onClose: () => {
      setSelectedId(null)
      setSelectedIds(new Set())
    },
    fileName: heading ?? 'model.ifc',
    bytes: sourceBytes,
    isolatedIds,
    visibleIds,
    selectedIds,
    formwork: quantities,
    quantityBusy,
    takeoffProgress,
    takeoffScopeIds: takeoffTarget.ids,
    takeoffScopeLabel: takeoffTarget.label,
    takeoffMissing: takeoffMissing.length,
    takeoffStale,
    onCalculateTakeoff: () => runTakeoff(takeoffTarget.ids, takeoffTarget.key),
    onCancelTakeoff: cancelTakeoff,
    onRecalculateTakeoff: () => runTakeoff(takeoffTarget.ids, takeoffTarget.key),
    onKeepTakeoff: () => setTakeoffDismissedKey(takeoffTarget.key),
    selectedFaceId,
    onSelectFace,
    onExported: (message: string) => {
      setExportMessage(message)
      setError(null)
    },
    onError: setError,
    report,
    reportBusy,
    reportProgress: warehouseProgress,
    followViewer,
    onReportRow,
    onReportExport,
    savedViews,
    activeViewId,
    viewSourceLabel,
    viewExportBusy: ifcExportBusy,
    exportingViewId,
    onSaveView,
    onShowView,
    onUpdateView,
    onExportView,
    onDeleteView,
  }

  const mobileTabs: Array<{ id: MobileTab; label: string }> = [
    { id: 'tree', label: 'Tree' },
    { id: 'filters', label: 'Filters' },
    { id: 'reports', label: 'Reports' },
    { id: 'properties', label: 'Properties' },
    { id: 'views', label: 'Saved Views' },
    { id: 'quantities', label: 'Quantities' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'export', label: 'Export' },
  ]

  const projectHome = (
    <EmptyState
      onOpen={onOpen}
      dragActive={dragActive}
      busy={busy}
      projectsEnabled={desktopHost}
      projectsRoot={projectsRoot}
      projects={projects}
      currentProject={project}
      hasOpenModel={!empty}
      onCreateProject={(name) => void onCreateProject(name)}
      onOpenProject={(id) => void onOpenProject(id)}
      onCloseProject={() => void onCloseProject()}
      onDeleteProject={(id) => void onDeleteProject(id)}
      onBackToViewer={homeOpen && !empty ? () => setHomeOpen(false) : undefined}
    />
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <AppHeader
        fileName={heading}
        busy={busy}
        onOpen={onOpen}
        projectName={project?.name ?? null}
        homeOpen={desktopHost && homeOpen}
        onProjects={desktopHost ? () => setHomeOpen(true) : undefined}
        onCloseProject={desktopHost && project ? () => void onCloseProject() : undefined}
        onBackToViewer={desktopHost && homeOpen && !empty ? () => setHomeOpen(false) : undefined}
        canLoad={!desktopHost || Boolean(project)}
        onExportIfc={desktopHost && result ? () => void onExportIfc() : undefined}
        exportBusy={ifcExportBusy}
      />
      {desktopHost && homeOpen ? (
        <div
          className="relative min-h-0 flex-1"
          onDragOver={(event) => {
            event.preventDefault()
            if (project) setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
        >
          {projectHome}
        </div>
      ) : (
        <>
      <ToolStrip
        canFit={result != null}
        matchCount={isolatedIds?.size ?? null}
        hasSelection={selectedIds.size > 0}
        displayMode={displayMode}
        hiddenCount={hiddenIds.size}
        canShowAll={displayMode !== 'all' || hiddenIds.size > 0 || treeScopeIds != null || simDate != null}
        calculatedView={calculatedView}
        canShowCalculatedView={quantities != null || quantityBusy}
        faceSelectMode={faceSelectMode}
        showOpenings={showOpenings}
        showSpaces={showSpaces}
        onFit={() => setFitToken((token) => token + 1)}
        onHide={onHideSelected}
        onGhost={onGhostSelected}
        onIsolate={onIsolateSelected}
        onShowAll={onShowAll}
        onToggleOpenings={() => setShowOpenings((value) => !value)}
        onToggleSpaces={() => setShowSpaces((value) => !value)}
        onToggleCalculatedView={onToggleCalculatedView}
        onToggleFaceSelectMode={() => setFaceSelectMode((value) => !value)}
        estimationPanes={estimationUiOpen ? estimationPanes : undefined}
        onToggleEstimationPane={estimationUiOpen ? toggleEstimationPane : undefined}
      />
      <div ref={rowRef} className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {estimationUiOpen ? null : (
          <>
            <div
              ref={leftPaneRef}
              className="hidden min-h-0 overflow-hidden lg:flex lg:shrink-0"
              style={{ width: leftWidth }}
            >
              <LeftDock tab={leftTab} onTabChange={setLeftTab} {...leftDock} />
            </div>
            <ResizeHandle
              label="Resize left panel"
              onDrag={(delta) => dragLeft(delta, rowRef.current?.clientWidth || window.innerWidth, leftPaneRef.current)}
              onDragEnd={commitLeft}
              onReset={() => resetLeft(leftPaneRef.current)}
            />
          </>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          key="main-viewer"
          className={cn(
            'relative min-w-0 flex-1',
            estimationUiOpen ? 'min-h-0' : 'min-h-[36vh] lg:min-h-0',
          )}
          onDragOver={(event) => {
            event.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
        >
          {(busy || (!empty && !sceneReady) || (progress != null && progress.phase !== 'complete')) && (
            <LoadingOverlay
              progress={progress}
              parsing={parsing}
              fileName={loadingName ?? heading}
            />
          )}
          {empty ? projectHome : (
            <ViewerCanvas
              geometry={geometryStore}
              geometryComplete={!busy && result != null}
              onSceneReady={onViewerSceneReady}
              selectedIds={selectedIds}
              isolatedIds={simLook ? null : isolatedIds}
              hiddenIds={hiddenIds}
              hiddenTypeIds={hiddenTypeIds}
              ghostIds={ghostIds}
              viewIsolateIds={viewIsolateIds}
              onShowAll={onShowAll}
              onHideSelected={onHideSelected}
              onIsolateSelected={onIsolateSelected}
              onSelectIsolated={onSelectIsolated}
              onSelect={onSelect}
              onHover={onHover}
              fitToken={fitToken}
              theme={theme}
              overlayFaces={overlayFaces}
              colorOverrides={simColorMap ?? filterColorMap}
              selectedFaceId={selectedFaceId}
              onSelectFace={onSelectFace}
              basketFaces={faceBasketList.length > 0 ? faceBasketList : null}
              onFaceCandidate={onFaceCandidate}
              onRegisterBasket={onRegisterFaceBasket}
              onClearBasket={onClearFaceBasket}
            />
          )}
          {selectedElementCost ? <ElementCostCard {...selectedElementCost} /> : null}
        </div>
        {estimationUiOpen && estimationPanes.buildup ? (
          buildupPopped ? (
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-muted/60 px-3 py-1.5 text-[12px] text-muted-foreground">
              <span>Assembly build-up is open in its own window.</span>
              <button
                type="button"
                className="rounded px-2 py-1 text-[12px] font-medium text-foreground hover:bg-accent"
                onClick={() => {
                  setBuildupPopped(false)
                  void closePaneWindow('buildup')
                }}
              >
                Dock back
              </button>
            </div>
          ) : (
          <>
            <ResizeHandle
              axis="y"
              label="Resize assembly build-up"
              onDrag={(delta) => setBuildUpHeight((height) => Math.min(480, Math.max(160, height - delta)))}
              onReset={() => setBuildUpHeight(280)}
            />
            <div className="min-h-0 shrink-0 overflow-hidden border-t border-border" style={{ height: buildUpHeight }}>
              <AssemblyBuildUp
                assembly={selectedBoqAssembly}
                elementIds={selectedBoq?.ids ?? []}
                assemblyQty={selectedBoqQty}
                quantities={quantities}
                propertyCatalog={propertyCatalog}
                bindings={estimationSheet.qtyBindings ?? {}}
                excludedLines={estimationSheet.excludedLines ?? {}}
                parameterOverrides={estimationSheet.parameterOverrides ?? {}}
                onBind={onBindBuildUpQty}
                onExcludedChange={onExcludedBuildUpChange}
                onParameterOverrideChange={onParameterOverrideChange}
                measureIfc={measureBoqIfc}
                onClose={() => setEstimationPane('buildup', false)}
                onPopOut={onPopOutBuildUp}
                emptyHint={buildUpEmptyHint}
              />
            </div>
          </>
          )
        ) : null}
        </div>
        {estimationUiOpen ? (
          estimationPanes.boq || estimationPanes.chat ? (
          <>
            <ResizeHandle
              label="Resize estimation panel"
              onDrag={(delta) =>
                dragEstimation(delta, rowRef.current?.clientWidth || window.innerWidth, estimationPaneRef.current)
              }
              onDragEnd={commitEstimation}
              onReset={() => resetEstimation(estimationPaneRef.current)}
            />
            <div
              ref={estimationPaneRef}
              className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-border max-lg:!w-full lg:flex-none lg:border-t-0 lg:border-l"
              style={{ width: estimationWidth }}
            >
              {estimationPanes.boq ? (
              <div className="min-h-0 flex-1 overflow-hidden">
              <EstimationPanel
                doc={estimation}
                previewTree={estimationPreviewTree}
                catalog={assemblyCatalog}
                propertyCatalog={propertyCatalog}
                quantities={quantities}
                quantityBusy={quantityBusy}
                takeoffProgress={takeoffProgress}
                selectedIds={selectedIds}
                selectedId={selectedBoqId}
                hint={
                  !result
                    ? 'Open a model first.'
                    : parsing || warehouseBusy
                      ? 'Reading properties…'
                      : estimationGroupBy.length > 0 && estimationPreviewTree.length === 0
                        ? 'No groups yet — wait for properties or pick another field.'
                        : null
                }
                onChange={setEstimation}
                onSelect={(node) => setSelectedBoqId(node?.id ?? null)}
                onBuild={onBuildEstimation}
                bindReady={Boolean(warehouse || (store && !parsing))}
                onBind={onBindImportedBoq}
                onShow={onShowBoq}
                onCalculateTakeoff={(ids) => {
                  const unique = [...new Set(ids)]
                  runTakeoff(unique, `est|${unique.length}|${xorIds(unique)}`, { openPanel: false })
                }}
                onCancelTakeoff={cancelTakeoff}
                onClosePane={() => setEstimationPane('boq', false)}
              />
              </div>
              ) : null}
              {estimationPanes.boq && estimationPanes.chat ? (
              <ResizeHandle
                axis="y"
                label="Resize estimator chat"
                onDrag={(delta) => setEstimatorHeight((height) => Math.min(420, Math.max(140, height - delta)))}
                onReset={() => setEstimatorHeight(240)}
              />
              ) : null}
              {estimationPanes.chat ? (
              <div
                className={cn(
                  'min-h-0 overflow-hidden border-t border-border',
                  estimationPanes.boq ? 'shrink-0' : 'flex-1',
                )}
                style={estimationPanes.boq ? { height: estimatorHeight } : undefined}
              >
                <EstimatorAgentPanel
                  mcpReady={Boolean(mcp?.ready)}
                  mcpUrl={mcp?.url ?? null}
                  mcpToken={mcp?.ready ? mcp.token : null}
                  syncPort={mcp?.ready ? mcp.syncPort : null}
                  modelOverview={agentModelOverview}
                  catalog={assemblyCatalog}
                  catalogPath={assemblyPath}
                  estimation={estimation}
                  onEstimationChange={setEstimation}
                  quantities={quantities}
                  selectedIds={[...selectedIds]}
                  previewTree={estimationPreviewTree}
                  hints={selectedEntities.map((item) => ({
                    id: item.expressId,
                    ifcType: item.ifcType,
                    name: item.name,
                  }))}
                  selectionLabel={selectedLabel ?? (selectedId != null ? `#${selectedId}` : 'no selection')}
                  ensureQuantities={ensureAgentTakeoff}
                  applyViewer={applyAgentViewer}
                  searchElements={async (input) => searchElementsForAgent(input)}
                  onClose={() => setEstimationPane('chat', false)}
                />
              </div>
              ) : null}
            </div>
          </>
          ) : null
        ) : (
          <>
            <ResizeHandle
              label="Resize right panel"
              onDrag={(delta) => dragRight(delta, rowRef.current?.clientWidth || window.innerWidth, rightPaneRef.current)}
              onDragEnd={commitRight}
              onReset={() => resetRight(rightPaneRef.current)}
            />
            <div
              ref={rightPaneRef}
              className="hidden min-h-0 overflow-hidden lg:flex lg:shrink-0"
              style={{ width: rightWidth }}
            >
              <RightDock tab={rightTab} onTabChange={setRightTab} {...rightDock} />
            </div>
            <div className="flex min-h-0 flex-col border-t border-border lg:hidden">
              <div className="flex overflow-x-auto">
                {mobileTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={cn(
                      'shrink-0 border-b px-3 py-2 text-[12px]',
                      mobileTab === tab.id
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground',
                    )}
                    onClick={() => setMobileTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="h-72">
                {mobileTab === 'properties' ||
                mobileTab === 'views' ||
                mobileTab === 'export' ||
                mobileTab === 'quantities' ||
                mobileTab === 'dashboard' ? (
                  <RightDock tab={mobileTab} onTabChange={setMobileTab} showTabs={false} {...rightDock} />
                ) : (
                  <LeftDock tab={mobileTab} onTabChange={setMobileTab} showTabs={false} {...leftDock} />
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {result ? (
        <ScheduleDock
          open={scheduleOpen}
          onOpenChange={(open) => {
            setScheduleOpen(open)
            if (!open) setSimDate(null)
          }}
          workspaceTab={bottomTab}
          onWorkspaceTabChange={setBottomTab}
          model={scheduleModel}
          loading={scheduleOpen && bottomTab === 'schedule' && parsing && !scheduleModel?.hasSchedule}
          selectedTaskId={selectedTaskId}
          onSelectTask={onSelectScheduleTask}
          onImport={() => void onImportSchedule()}
          onReloadIfc={onReloadIfcSchedule}
          canReloadIfc={Boolean(importedGantt) || Boolean(store)}
          height={scheduleHeight}
          onHeightChange={setScheduleHeight}
          simDate={simDate}
          onSimDateChange={setSimDate}
          assemblyCount={ESTIMATION_ENABLED ? assemblyCatalog?.assemblies.length ?? 0 : 0}
          assemblyPanel={
            ESTIMATION_ENABLED ? (
              <CostAssemblyPanel
                catalog={assemblyCatalog}
                loading={assemblyLoading}
                error={assemblyError}
                selectedId={selectedAssemblyId}
                onSelect={onSelectAssembly}
                onReload={() => void loadAssemblies()}
                onOpenFile={() => void onOpenAssemblyFile()}
              />
            ) : null
          }
          estimationCount={ESTIMATION_ENABLED ? estimation.boqs.reduce((sum, boq) => sum + flattenBoq(boq.root).length, 0) : 0}
          showEstimationTab={ESTIMATION_ENABLED}
        />
      ) : null}
        </>
      )}
      <StatusBar
        progress={progress}
        result={result}
        selectedId={selectedId}
        selectedLabel={selectedLabel}
        hoverBindRef={hoverBindRef}
        hoverLookupRef={hoverLookupRef}
        parsing={parsing}
        engineStatus={engineStatus}
        isolatedCount={isolatedIds?.size ?? null}
        exportMessage={exportMessage}
        error={error}
        quantitiesOpen={rightTab === 'quantities' || mobileTab === 'quantities'}
        quantityBusy={quantityBusy}
        surfacesReady={quantities != null && !quantityBusy}
        quantitySummary={quantitySummary}
        reportBusy={reportBusy}
        reportProgress={warehouseProgress}
        onOpenQuantities={onOpenQuantities}
        mcpUrl={mcp?.url ?? null}
        mcpReady={Boolean(mcp?.ready)}
        mcpError={mcp?.error ?? null}
        mcpToken={mcp?.token ?? null}
      />
    </div>
  )
}

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
import { propertyRefFromMode, breakdownModeFromRef, type BreakdownMode } from '@/lib/breakdown'
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
  type QuerySpec,
} from '@/lib/ifc-query'
import { usePanelWidths } from '@/lib/panel-layout'
import { cn } from '@/lib/utils'
import { applyClickSelection, setsEqual } from '@/lib/selection'
import {
  ghostExpressIds,
  visibleExpressIds,
  type DisplayMode,
} from '@/lib/view-visibility'
import { intersectIds } from '@/lib/spatial-scope'
import { createLensProvider, propertyCatalogFromLensProvider } from '@/lib/lens-provider'
import { createWarehouseLensProvider } from '@/lib/warehouse-lens-provider'
import { createAutoColorLens, createPropertyColorLens, evaluateActiveLens } from '@/lib/user-lens'
import {
  ATTRIBUTE_IFC_TYPE,
  colorizeLeaves,
  colorMapFromTree,
  type PropertyRef,
  type PropertyTreeNode,
  propertyRefKey,
} from '@/lib/property-tree'
import { missingTakeoffIds, resolveTakeoffTarget, TAKEOFF_CHUNK, type TakeoffProgress } from '@/lib/takeoff-scope'
import { createMutationView, createWarehouseMutationView, overlayEntityData } from '@/lib/mutation-view'
import { recycleCsvProcessor } from '@/lib/csv-export'
import { BUILTIN_LENSES, type AutoColorSpec, type Lens, type LensOperator } from '@ifc-lite/lens'
import {
  EMPTY_REPORT_FILTER,
  applyGeometryQuantities,
  closeBimDatabase,
  downloadTextFile,
  exportBimDatabase,
  ingestWarehouse,
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
  propertyCatalogFromWarehouse,
  queryWarehouse,
  buildWarehousePropertyTree,
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
import { createViewerMeshStore } from '@/lib/viewer-meshes'
import { isGeometryFallbackTree, typeTreeFromMeshes, uniqueIfcTypeTree } from '@/lib/geometry-tree'
import { labelStorePropertyChunk, treeFromLabeledIds, STORE_PROPERTY_CHUNK } from '@/lib/store-property-tree'

type MobileTab = LeftTab | RightTab

const MAX_RESTORED_QUANTITIES_CHARS = 4_000_000

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
  const [breakdownMode, setBreakdownMode] = useState<BreakdownMode>('type')
  const [breakdownRules, setBreakdownRules] = useState<PropertyRef[]>([ATTRIBUTE_IFC_TYPE])
  const [breakdownColorize, setBreakdownColorize] = useState(false)
  const [breakdownNodeKey, setBreakdownNodeKey] = useState<string | null>(null)
  const [breakdownNodeIds, setBreakdownNodeIds] = useState<Set<number> | null>(null)
  const [filterProperty, setFilterProperty] = useState<PropertyRef | null>(null)
  const [filterNodeKey, setFilterNodeKey] = useState<string | null>(null)
  const [filterNodeIds, setFilterNodeIds] = useState<Set<number> | null>(null)
  const [storeFilterTree, setStoreFilterTree] = useState<PropertyTreeNode[]>([])
  const [leftTab, setLeftTab] = useState<LeftTab>('tree')
  const [rightTab, setRightTab] = useState<RightTab>('properties')
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [ifcExportBusy, setIfcExportBusy] = useState(false)
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
  const [treeScopeIds, setTreeScopeIds] = useState<Set<number> | null>(null)
  const [activeLens, setActiveLens] = useState<Lens | null>(null)
  const [userLenses, setUserLenses] = useState<Lens[]>([])
  const [parseTick, setParseTick] = useState(0)
  const [mutationTick, setMutationTick] = useState(0)
  const [warehouse, setWarehouse] = useState<BimDatabase | null>(null)
  const [warehouseBusy, setWarehouseBusy] = useState(false)
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
  const [geometryStore] = useState(createViewerMeshStore)
  const loadGen = useRef(0)
  const pendingSession = useRef<ProjectSession | null>(null)
  const pendingWarehouseRestore = useRef(false)
  const pendingQuantitiesRestore = useRef(false)
  const pendingParse = useRef(false)
  const facePositionCache = useRef<Map<number, ElementQuantity>>(new Map())
  const lastLoadSource = useRef<LoadSource | null>(null)
  const warehouseRestored = useRef(false)
  const takeoffGen = useRef(0)
  const quantitiesRef = useRef<QuantityResult | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const leftPaneRef = useRef<HTMLDivElement>(null)
  const rightPaneRef = useRef<HTMLDivElement>(null)
  const hoverBindRef = useRef<((id: number | null) => void) | null>(null)
  const hoverLookupRef = useRef<(id: number) => string>(() => '')
  const { leftWidth, rightWidth, dragLeft, dragRight, commitLeft, commitRight, resetLeft, resetRight } =
    usePanelWidths()
  const { theme } = useTheme()

  useEffect(() => subscribeGeometryEngine(setEngineStatus), [])

  const applySession = useCallback((session: ProjectSession) => {
    setDisplayMode('all')
    setRightTab(session.rightTab === 'quantities' ? 'properties' : session.rightTab)
    setBreakdownMode(session.breakdownMode)
    setBreakdownRules([propertyRefFromMode(session.breakdownMode)])
    setBreakdownNodeKey(null)
    setBreakdownNodeIds(null)
    setFilterProperty(null)
    setFilterNodeKey(null)
    setFilterNodeIds(null)
    setReportTemplate(session.reportTemplate)
    setReportGroupBy(session.reportGroupBy)
    setReportMetrics(session.reportMetrics)
    setReportFilter(session.reportFilter)
    setFollowViewer(session.followViewer)
    setMutationPatches(session.mutations)
  }, [])

  const rememberSnapshot = useCallback(async (snapshot: ProjectSnapshot, restoreSession = true) => {
    setProject(snapshot)
    pendingSession.current = restoreSession ? sessionFromSnapshot(snapshot) : null
    pendingWarehouseRestore.current = restoreSession && snapshot.hasWarehouse
    pendingQuantitiesRestore.current = restoreSession && snapshot.hasQuantities
    void listProjects()
      .then(setProjects)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (busy || !result || !sceneReady) return
    const wantsWarehouse =
      leftTab === 'filters' ||
      leftTab === 'lens' ||
      leftTab === 'breakdown' ||
      leftTab === 'reports' ||
      mobileTab === 'filters' ||
      mobileTab === 'lens' ||
      mobileTab === 'breakdown' ||
      mobileTab === 'reports'
    if (!wantsWarehouse) return
    const restoring = pendingWarehouseRestore.current && !warehouseRestored.current
    const reportsOpen =
      leftTab === 'reports' ||
      mobileTab === 'reports' ||
      rightTab === 'dashboard' ||
      mobileTab === 'dashboard'
    if (!restoring && (!reportsOpen || !store || parsing)) return
    let cancelled = false
    setWarehouseBusy(true)
    void (async () => {
      try {
        let db: BimDatabase
        if (pendingWarehouseRestore.current) {
          const bytes = await getProjectWarehouse()
          if (cancelled) return
          pendingWarehouseRestore.current = false
          if (!bytes) {
            if (!cancelled) setWarehouseBusy(false)
            return
          }
          try {
            db = await openBimDatabaseFromBytes(bytes)
            warehouseRestored.current = true
            if (isGeometryFallbackTree(spatialRoot) || !spatialRoot) {
              const tree = spatialTreeFromWarehouse(db)
              if (!cancelled && tree) setSpatialRoot(tree)
            }
          } catch (caught) {
            console.warn('Saved warehouse.sqlite was unreadable; rebuilding', caught)
            warehouseRestored.current = false
            if (!store) {
              if (!cancelled) setWarehouseBusy(false)
              return
            }
            db = await openBimDatabase()
            ingestWarehouse(db, store, spatialRoot, result.fileName, result.cacheKey)
          }
        } else if (warehouseRestored.current) {
          if (!cancelled) setWarehouseBusy(false)
          return
        } else if (store) {
          db = await openBimDatabase()
          ingestWarehouse(db, store, spatialRoot, result.fileName, result.cacheKey)
        } else {
          if (!cancelled) setWarehouseBusy(false)
          return
        }
        if (cancelled) {
          closeBimDatabase(db)
          return
        }
        setWarehouse((current) => {
          closeBimDatabase(current)
          return db
        })
        setReportTick((tick) => tick + 1)
        if (projectsAvailable() && project && store) {
          try {
            await saveProjectWarehouse(exportBimDatabase(db))
          } catch (caught) {
            console.warn('Could not save warehouse.sqlite', caught)
          }
        }
      } catch (caught) {
        if (!cancelled) {
          console.warn('BIM warehouse ingest failed', caught)
          setError(caught instanceof Error ? caught.message : String(caught))
        }
      } finally {
        if (!cancelled) setWarehouseBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [busy, sceneReady, store, spatialRoot, result, project, parsing, leftTab, mobileTab, rightTab])

  useEffect(() => {
    if (busy || !sceneReady || !warehouse || !quantities) return
    applyGeometryQuantities(warehouse, quantities)
    setReportTick((tick) => tick + 1)
  }, [busy, sceneReady, warehouse, quantities])

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
    setActiveLens(null)
    setUserLenses([])
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
    setBreakdownMode('type')
    setBreakdownRules([ATTRIBUTE_IFC_TYPE])
    setBreakdownColorize(false)
    setBreakdownNodeKey(null)
    setBreakdownNodeIds(null)
    setFilterProperty(null)
    setFilterNodeKey(null)
    setFilterNodeIds(null)
    setStoreFilterTree([])
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

  useEffect(() => {
    const needsStepIndex =
      leftTab === 'lens' ||
      leftTab === 'breakdown' ||
      leftTab === 'reports' ||
      mobileTab === 'lens' ||
      mobileTab === 'breakdown' ||
      mobileTab === 'reports' ||
      ((leftTab === 'filters' || mobileTab === 'filters') &&
        filterProperty != null &&
        !(filterProperty.kind === 'attribute' && filterProperty.name === 'IFC Type'))
    if (!needsStepIndex) return
    if (store || warehouse || busy || parsing || warehouseBusy || !sceneReady || !result) return
    if (pendingParse.current || pendingWarehouseRestore.current) return
    pendingParse.current = true
    setParseTick((tick) => tick + 1)
  }, [leftTab, mobileTab, filterProperty, store, warehouse, busy, parsing, warehouseBusy, sceneReady, result])

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
    setActiveLens(null)
    setUserLenses([])
    setMutationTick(0)
    setMutationPatches([])
    setWarehouse((current) => {
      closeBimDatabase(current)
      return null
    })
    setReportFilter(EMPTY_REPORT_FILTER)
    setFollowViewer(true)
    setSpec(EMPTY_QUERY)
    setBreakdownMode('type')
    setBreakdownRules([ATTRIBUTE_IFC_TYPE])
    setBreakdownColorize(false)
    setBreakdownNodeKey(null)
    setBreakdownNodeIds(null)
    setFilterProperty(null)
    setFilterNodeKey(null)
    setFilterNodeIds(null)
    setStoreFilterTree([])
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
          breakdownMode,
          reportTemplate,
          reportGroupBy,
          reportMetrics,
          reportFilter,
          followViewer,
          mutations: mutationPatches,
          quantities: persistableQuantities(quantities),
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
    breakdownMode,
    reportTemplate,
    reportGroupBy,
    reportMetrics,
    reportFilter,
    followViewer,
    mutationPatches,
    quantities,
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
      setMobileTab('properties')
      setRightTab('properties')
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

  const onSpecChange = useCallback((next: QuerySpec) => {
    setSpec(next)
    setFilterNodeKey(null)
    setFilterNodeIds(null)
    setBreakdownNodeKey(null)
    setBreakdownNodeIds(null)
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
        breakdownMode,
        reportTemplate,
        reportGroupBy,
        reportMetrics,
        reportFilter,
        followViewer,
        mutations: mutationPatches,
        quantities: persistableQuantities(quantities),
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
    breakdownMode,
    reportTemplate,
    reportGroupBy,
    reportMetrics,
    reportFilter,
    followViewer,
    mutationPatches,
    quantities,
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
  }, [warehouse, store])

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
  const onExportIfc = useCallback(async () => {
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
      const exported = exportIfcWithMutations(exportStore, exportView)
      const baseName = (result.fileName || 'model.ifc').replace(/\.ifc$/i, '')
      const path = await saveFileDialog({
        title: 'Export IFC',
        defaultPath: `${baseName}-edited.ifc`,
        filters: [{ name: 'IFC', extensions: ['ifc'] }],
      })
      if (!path) return
      await writeIfcFile(path, exported.content)
      const warningNote =
        exported.warnings.length > 0
          ? ` (${exported.warnings.length} warning${exported.warnings.length === 1 ? '' : 's'})`
          : ''
      setExportMessage(
        `Exported ${exported.modifiedEntityCount} modified of ${exported.entityCount} entities to ${path}${warningNote}`,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setIfcExportBusy(false)
    }
  }, [result, store, mutationPatches])

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
    const typeById = new Map(selectedMeshes.map((mesh) => [mesh.expressId, mesh.ifcType]))
    return [...selectedIds].map((id) => {
      const type =
        typeById.get(id) ??
        store?.entities.getTypeName(id) ??
        warehouseLookup?.get(id)?.ifcType ??
        'IfcProduct'
      const base = readEntity(store, warehouse, id, type)
      return mutationView ? overlayEntityData(base, mutationView) : base
    })
  }, [selectedIds, selectedMeshes, store, warehouse, warehouseLookup, mutationView, mutationTick])

  const selectedLabel = useMemo(() => {
    if (selectedIds.size > 1) return `${selectedIds.size} selected`
    if (!entity) return null
    return entity.name ? `${entity.ifcType} (${entity.name})` : `${entity.ifcType} #${entity.expressId}`
  }, [entity, selectedIds])

  useEffect(() => {
    hoverLookupRef.current = (id: number) => {
      const cached = warehouseLookup?.get(id)
      const type = store?.entities.getTypeName(id) ?? cached?.ifcType ?? 'IfcProduct'
      const name = store?.entities.getName(id) || cached?.name
      return name ? `${type} ${name}` : `${type} #${id}`
    }
  }, [store, warehouseLookup])

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
  }, [warehouse, store, spec, parsing])

  const queryIsolatedIds = queryState.ids
  const propertiesUiOpen =
    leftTab === 'filters' ||
    leftTab === 'lens' ||
    leftTab === 'breakdown' ||
    mobileTab === 'filters' ||
    mobileTab === 'lens' ||
    mobileTab === 'breakdown'
  const lensUiOpen = leftTab === 'lens' || mobileTab === 'lens' || activeLens != null
  const breakdownUiOpen = leftTab === 'breakdown' || mobileTab === 'breakdown' || breakdownColorize

  const filterTree = useMemo(() => {
    if (leftTab !== 'filters' && mobileTab !== 'filters') return []
    if (!filterProperty) return []
    if (warehouse) return buildWarehousePropertyTree(warehouse, [filterProperty], spec)
    if (filterProperty.kind === 'attribute' && filterProperty.name === 'IFC Type') {
      return uniqueIfcTypeTree(geometryStore.list())
    }
    return storeFilterTree
  }, [warehouse, filterProperty, spec, leftTab, mobileTab, geometryStore, geometryGen, storeFilterTree])

  const breakdownTree = useMemo(() => {
    if (!warehouse || breakdownRules.length === 0 || !breakdownUiOpen) return []
    const raw = buildWarehousePropertyTree(
      warehouse,
      breakdownRules,
      spec,
      filterNodeIds ? [...filterNodeIds] : queryIsolatedIds ? [...queryIsolatedIds] : undefined,
    )
    return breakdownColorize ? colorizeLeaves(raw) : raw
  }, [warehouse, breakdownRules, spec, filterNodeIds, queryIsolatedIds, breakdownColorize, breakdownUiOpen])

  const breakdownColorMap = useMemo(
    () => (breakdownColorize ? colorMapFromTree(breakdownTree) : null),
    [breakdownColorize, breakdownTree],
  )

  const isolatedIds = useMemo(
    () => intersectIds(treeScopeIds, breakdownNodeIds ?? filterNodeIds ?? queryIsolatedIds),
    [treeScopeIds, breakdownNodeIds, filterNodeIds, queryIsolatedIds],
  )

  const lenses = useMemo(() => [...BUILTIN_LENSES, ...userLenses], [userLenses])
  const lensProvider = useMemo(() => {
    if (!lensUiOpen) return null
    try {
      if (warehouse) return createWarehouseLensProvider(warehouse)
      if (store && !parsing) return createLensProvider(store)
    } catch (caught) {
      console.warn('Lens provider failed', caught)
    }
    return null
  }, [store, warehouse, lensUiOpen, parsing])
  const propertyCatalog = useMemo(() => {
    void reportTick
    if (!propertiesUiOpen) return []
    try {
      if (warehouse) return propertyCatalogFromWarehouse(warehouse)
      if (store && !parsing) return propertyCatalogFromLensProvider(createLensProvider(store))
    } catch (caught) {
      console.warn('Property catalog failed', caught)
    }
    return []
  }, [warehouse, store, reportTick, propertiesUiOpen, parsing])
  const lensResult = useMemo(() => {
    if (!lensProvider || !activeLens) return null
    try {
      return evaluateActiveLens(activeLens, lensProvider)
    } catch (caught) {
      console.warn('Lens evaluation failed', caught)
      return null
    }
  }, [lensProvider, activeLens])
  const lensLegend = lensResult?.legend ?? []
  const dataReady = store != null || warehouse != null
  const propertyHint =
    parsing || warehouseBusy
      ? 'Reading IFC properties…'
      : dataReady
        ? null
        : result
          ? 'IFC Type is ready from 3D. Pick another property to index it on demand.'
          : null

  const combinedHiddenIds = useMemo(() => {
    if (!lensResult || lensResult.hiddenIds.size === 0) return hiddenIds
    const next = new Set(hiddenIds)
    for (const id of lensResult.hiddenIds) next.add(id)
    return next
  }, [hiddenIds, lensResult])

  const allExpressIds = useMemo(() => geometryStore.ids().slice(), [geometryStore, geometryGen])

  useEffect(() => {
    if (warehouse) return
    if (leftTab !== 'filters' && mobileTab !== 'filters') return
    if (!store || !filterProperty) {
      setStoreFilterTree([])
      return
    }
    if (filterProperty.kind === 'attribute' && filterProperty.name === 'IFC Type') return
    const ids = allExpressIds
    const labels = new Map<number, string>()
    let index = 0
    let cancelled = false
    let frame = 0
    const pump = () => {
      if (cancelled) return
      const end = Math.min(index + STORE_PROPERTY_CHUNK, ids.length)
      labelStorePropertyChunk(store, filterProperty, ids, index, end, labels)
      index = end
      setStoreFilterTree(treeFromLabeledIds(ids.slice(0, index), labels))
      if (index < ids.length) frame = requestAnimationFrame(pump)
    }
    frame = requestAnimationFrame(pump)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [warehouse, store, filterProperty, leftTab, mobileTab, allExpressIds])
  const viewIsolateIds = displayMode === 'isolate' ? focusIds : null
  const ghostIds = useMemo(
    () => ghostExpressIds(displayMode, focusIds, allExpressIds, isolatedIds, combinedHiddenIds),
    [displayMode, focusIds, allExpressIds, isolatedIds, combinedHiddenIds],
  )
  const visibleIds = useMemo(
    () => visibleExpressIds(allExpressIds, isolatedIds, viewIsolateIds, combinedHiddenIds),
    [allExpressIds, isolatedIds, viewIsolateIds, combinedHiddenIds],
  )

  const onShowAll = useCallback(() => {
    setDisplayMode('all')
    setFocusIds(new Set())
    setHiddenIds(new Set())
    setTreeScopeIds(null)
    setFilterNodeKey(null)
    setFilterNodeIds(null)
    setBreakdownNodeKey(null)
    setBreakdownNodeIds(null)
  }, [])

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
      setDisplayMode('all')
      setFocusIds(new Set())
      return
    }
    setDisplayMode('ghost')
    setFocusIds(new Set(selectedIds))
  }, [displayMode, focusIds, selectedIds])

  const onIsolateSelected = useCallback(() => {
    if (selectedIds.size === 0) return
    if (displayMode === 'isolate' && setsEqual(focusIds, selectedIds)) {
      setDisplayMode('all')
      setFocusIds(new Set())
      return
    }
    setDisplayMode('isolate')
    setFocusIds(new Set(selectedIds))
  }, [displayMode, focusIds, selectedIds])

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
        filterPropertyKey: filterProperty ? propertyRefKey(filterProperty) : null,
        filterNodeKey,
        filterIds: filterNodeIds ? [...filterNodeIds] : null,
        breakdownRuleKeys: breakdownRules.map(propertyRefKey),
        breakdownNodeKey,
        breakdownIds: breakdownNodeIds ? [...breakdownNodeIds] : null,
        selectedIds: [...selectedIds],
      }),
    [
      spec.typeScope,
      spec.storeyId,
      filterProperty,
      filterNodeKey,
      filterNodeIds,
      breakdownRules,
      breakdownNodeKey,
      breakdownNodeIds,
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
    (ids: number[], key: string) => {
      if (ids.length === 0) return
      const gen = takeoffGen.current + 1
      takeoffGen.current = gen
      setRightTab('quantities')
      setMobileTab('quantities')
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
      setMutationPatches((prev) => {
        const rest = prev.filter(
          (patch) =>
            !(
              patch.expressId === faceBasketExpressId &&
              patch.kind === 'property' &&
              patch.pset === pset &&
              patch.name === name
            ),
        )
        return [...rest, { expressId: faceBasketExpressId, kind: 'property', pset, name, value: netValue }]
      })
      setMutationTick((tick) => tick + 1)
      setError(null)
      onClearFaceBasket()
    },
    [mutationView, faceBasketExpressId, faceBasketList, onClearFaceBasket],
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
    const net = picked.reduce((sum, item) => sum + item.metrics.UNCOVEREDAREA, 0)
    return `LATERAL ${lateral.toFixed(2)} · NET ${net.toFixed(2)} m²`
  }, [quantities, selectedIds, quantityBusy, takeoffProgress])

  const reportsOpen =
    leftTab === 'reports' ||
    rightTab === 'dashboard' ||
    mobileTab === 'reports' ||
    mobileTab === 'dashboard'
  const reportScope = followViewer && selectedIds.size > 0 ? selectedIds : isolatedIds
  const reportOptions: FilterOptions | null = useMemo(() => {
    if (!warehouse || !reportsOpen) return null
    void reportTick
    return loadFilterOptions(warehouse)
  }, [warehouse, reportTick, reportsOpen])
  const report: ReportResult | null = useMemo(() => {
    if (!warehouse || !reportsOpen) return null
    void reportTick
    try {
      return runReport(warehouse, reportTemplate, reportFilter, reportGroupBy, reportMetrics, reportScope)
    } catch (caught) {
      console.warn('Report query failed', caught)
      return null
    }
  }, [warehouse, reportTick, reportTemplate, reportFilter, reportGroupBy, reportMetrics, reportScope, reportsOpen])

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

  const leftDock = {
    root: spatialRoot,
    store,
    selectedId,
    selectedIds,
    isolatedIds,
    parsing,
    onSelect: (id: number, additive?: boolean) => onSelect(id, additive),
    spec,
    matchCount: filterNodeIds?.size ?? null,
    filterError: queryState.error,
    filterReady: Boolean(result && sceneReady),
    filterHint: propertyHint,
    propertyCatalog,
    onSpecChange,
    filterProperty,
    filterTree,
    filterNodeKey,
    onSelectFilterProperty: (ref: PropertyRef | null) => {
      setFilterProperty(ref)
      setFilterNodeKey(null)
      setFilterNodeIds(null)
    },
    onSelectFilterValue: (node: PropertyTreeNode | null) => {
      if (!node) {
        setFilterNodeKey(null)
        setFilterNodeIds(null)
        return
      }
      setFilterNodeKey(node.key)
      setFilterNodeIds(new Set(node.ids))
      setSelectedIds(new Set(node.ids))
      setSelectedId(node.ids[0] ?? null)
      setFollowViewer(true)
    },
    breakdownRules,
    breakdownTree,
    breakdownNodeKey,
    breakdownColorize,
    onBreakdownRulesChange: (rules: PropertyRef[]) => {
      setBreakdownRules(rules)
      setBreakdownMode(breakdownModeFromRef(rules[0] ?? ATTRIBUTE_IFC_TYPE))
      setBreakdownNodeKey(null)
      setBreakdownNodeIds(null)
    },
    onSelectBreakdownNode: (node: PropertyTreeNode | null) => {
      if (!node) {
        setBreakdownNodeKey(null)
        setBreakdownNodeIds(null)
        return
      }
      setBreakdownNodeKey(node.key)
      setBreakdownNodeIds(new Set(node.ids))
      setSelectedIds(new Set(node.ids))
      setSelectedId(node.ids[0] ?? null)
      setFollowViewer(true)
      setLeftTab('breakdown')
      setMobileTab('breakdown')
    },
    onBreakdownColorizeChange: setBreakdownColorize,
    onSelectId: (expressId: number, additive?: boolean) => onSelect(expressId, additive),
    onSelectScope,
    lenses,
    lensId: activeLens?.id ?? null,
    lensResult,
    lensLegend,
    lensReady: dataReady,
    lensHint: propertyHint,
    onLensSelect: (lens: Lens | null) => {
      setActiveLens(lens)
      if (lens) {
        setLeftTab('lens')
        setMobileTab('lens')
      }
    },
    onCreateAutoColorLens: (spec: AutoColorSpec, name: string) => {
      const lens = createAutoColorLens(spec, name)
      setUserLenses((current) => [...current, lens])
      setActiveLens(lens)
      setLeftTab('lens')
      setMobileTab('lens')
    },
    onCreatePropertyLens: (input: {
      propertySet: string
      propertyName: string
      operator: LensOperator
      propertyValue: string
      color: string
      kind: 'property' | 'quantity'
    }) => {
      const lens = createPropertyColorLens(input)
      setUserLenses((current) => [...current, lens])
      setActiveLens(lens)
      setLeftTab('lens')
      setMobileTab('lens')
    },
    onRemoveLens: (id: string) => {
      setUserLenses((current) => current.filter((lens) => lens.id !== id))
      setActiveLens((current) => (current?.id === id ? null : current))
    },
    reportReady: warehouse != null,
    reportBusy: warehouseBusy,
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
    entities: selectedEntities,
    mutationCount: mutationView?.getModifiedEntityCount() ?? 0,
    onEditAttribute: (name: string, value: string) => {
      if (!mutationView) return
      const next: MutationPatch[] = [...mutationPatches]
      for (const id of selectedIds) {
        mutationView.setAttribute(id, name, value)
        const rest = next.filter((patch) => !(patch.kind === 'attribute' && patch.expressId === id && patch.name === name))
        rest.push({ expressId: id, kind: 'attribute', name, value })
        next.length = 0
        next.push(...rest)
      }
      setMutationPatches(next)
      setMutationTick((tick) => tick + 1)
    },
    onEditProperty: (pset: string, name: string, value: string) => {
      if (!mutationView) return
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
      setMutationPatches(next)
      setMutationTick((tick) => tick + 1)
    },
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
    reportBusy: warehouseBusy,
    followViewer,
    onReportRow,
    onReportExport,
  }

  const mobileTabs: Array<{ id: MobileTab; label: string }> = [
    { id: 'tree', label: 'Tree' },
    { id: 'breakdown', label: 'Breakdown' },
    { id: 'filters', label: 'Filters' },
    { id: 'lens', label: 'Lens' },
    { id: 'reports', label: 'Reports' },
    { id: 'properties', label: 'Properties' },
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
        hiddenCount={combinedHiddenIds.size}
        canShowAll={displayMode !== 'all' || hiddenIds.size > 0 || treeScopeIds != null}
        calculatedView={calculatedView}
        canShowCalculatedView={quantities != null || quantityBusy}
        faceSelectMode={faceSelectMode}
        onFit={() => setFitToken((token) => token + 1)}
        onHide={onHideSelected}
        onGhost={onGhostSelected}
        onIsolate={onIsolateSelected}
        onShowAll={onShowAll}
        onToggleCalculatedView={onToggleCalculatedView}
        onToggleFaceSelectMode={() => setFaceSelectMode((value) => !value)}
      />
      <div ref={rowRef} className="flex min-h-0 flex-1 flex-col lg:flex-row">
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
        <div
          className="relative min-h-[48vh] min-w-0 flex-1 lg:min-h-0"
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
              isolatedIds={isolatedIds}
              hiddenIds={combinedHiddenIds}
              ghostIds={ghostIds}
              viewIsolateIds={viewIsolateIds}
              onSelect={onSelect}
              onHover={onHover}
              fitToken={fitToken}
              theme={theme}
              overlayFaces={overlayFaces}
              colorOverrides={lensResult?.colorMap ?? breakdownColorMap}
              selectedFaceId={selectedFaceId}
              onSelectFace={onSelectFace}
              basketFaces={faceBasketList.length > 0 ? faceBasketList : null}
              onFaceCandidate={onFaceCandidate}
              onRegisterBasket={onRegisterFaceBasket}
              onClearBasket={onClearFaceBasket}
            />
          )}
        </div>
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
            mobileTab === 'export' ||
            mobileTab === 'quantities' ||
            mobileTab === 'dashboard' ? (
              <RightDock tab={mobileTab} onTabChange={setMobileTab} showTabs={false} {...rightDock} />
            ) : (
              <LeftDock tab={mobileTab} onTabChange={setMobileTab} showTabs={false} {...leftDock} />
            )}
          </div>
        </div>
      </div>
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
        onOpenQuantities={onOpenQuantities}
      />
    </div>
  )
}

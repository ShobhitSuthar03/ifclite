import type { DragEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MeshData } from '@ifc-lite/geometry'
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
  loadSampleModel,
  pickIfcFile,
  resolveSourceBytes,
  subscribeGeometryEngine,
  type GeometryEngineStatus,
  type LoadProgress,
  type LoadResult,
  type LoadSource,
} from '@/lib/ifc-loader'
import { buildBreakdown, type BreakdownMode } from '@/lib/breakdown'
import { computeElementQuantities, meshesForQuantityJob, type QuantityResult } from '@/lib/geometry-qto'
import {
  EMPTY_QUERY,
  createIfcQuery,
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
import { createLensProvider } from '@/lib/lens-provider'
import { createMutationView, overlayEntityData } from '@/lib/mutation-view'
import { recycleCsvProcessor } from '@/lib/csv-export'
import { evaluateLens, type Lens, type LensEvaluationResult } from '@ifc-lite/lens'
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
  createProject,
  getProjectsRoot,
  importIfcBytes,
  importIfcPath,
  listProjects,
  openProject,
  projectsAvailable,
  saveProjectSession,
  saveProjectWarehouse,
  sessionFromSnapshot,
  warehouseBytesFromSnapshot,
  type ProjectRecord,
  type ProjectSnapshot,
} from '@/lib/projects'
import {
  persistableQuantities,
  type MutationPatch,
  type ProjectSession,
} from '@/lib/project-session'

type MobileTab = LeftTab | RightTab

function readEntity(
  store: IfcDataStore | null,
  expressId: number,
  ifcType: string,
): EntityData {
  if (!store) {
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
  const [meshes, setMeshes] = useState<MeshData[]>([])
  const [result, setResult] = useState<LoadResult | null>(null)
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
  const [groupKey, setGroupKey] = useState<string | null>(null)
  const [leftTab, setLeftTab] = useState<LeftTab>('tree')
  const [rightTab, setRightTab] = useState<RightTab>('properties')
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [engineStatus, setEngineStatus] = useState<GeometryEngineStatus>(getGeometryEngineStatus)
  const [quantities, setQuantities] = useState<QuantityResult | null>(null)
  const [quantityBusy, setQuantityBusy] = useState(false)
  const [displayMode, setDisplayMode] = useState<DisplayMode>('all')
  const [focusIds, setFocusIds] = useState<Set<number>>(() => new Set())
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(() => new Set())
  const [treeScopeIds, setTreeScopeIds] = useState<Set<number> | null>(null)
  const [activeLens, setActiveLens] = useState<Lens | null>(null)
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
  const loadGen = useRef(0)
  const pendingSession = useRef<ProjectSession | null>(null)
  const pendingWarehouse = useRef<Uint8Array | null>(null)
  const warehouseRestored = useRef(false)
  const pendingMeshes = useRef<MeshData[]>([])
  const meshRaf = useRef(0)
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
    setSelectedIds(new Set(session.selectedIds))
    setSelectedId(session.selectedIds.at(-1) ?? null)
    setHiddenIds(new Set(session.hiddenIds))
    setFocusIds(new Set(session.focusIds))
    setTreeScopeIds(session.treeScopeIds ? new Set(session.treeScopeIds) : null)
    setDisplayMode(session.displayMode)
    setLeftTab(session.leftTab)
    setRightTab(session.rightTab)
    setSpec(session.spec)
    setBreakdownMode(session.breakdownMode)
    setReportTemplate(session.reportTemplate)
    setReportGroupBy(session.reportGroupBy)
    setReportMetrics(session.reportMetrics)
    setReportFilter(session.reportFilter)
    setFollowViewer(session.followViewer)
    setQuantities(session.quantities)
    setMutationPatches(session.mutations)
  }, [])

  const rememberSnapshot = useCallback((snapshot: ProjectSnapshot, restoreSession = true) => {
    setProject(snapshot)
    pendingSession.current = restoreSession ? sessionFromSnapshot(snapshot) : null
    pendingWarehouse.current = restoreSession ? warehouseBytesFromSnapshot(snapshot) : null
    void listProjects()
      .then(setProjects)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!store || !result || parsing) return
    let cancelled = false
    setWarehouseBusy(true)
    void (async () => {
      try {
        let db: BimDatabase
        if (pendingWarehouse.current && !warehouseRestored.current) {
          warehouseRestored.current = true
          const bytes = pendingWarehouse.current
          pendingWarehouse.current = null
          try {
            db = await openBimDatabaseFromBytes(bytes)
          } catch (caught) {
            console.warn('Saved warehouse.sqlite was unreadable; rebuilding', caught)
            warehouseRestored.current = false
            db = await openBimDatabase()
            ingestWarehouse(db, store, spatialRoot, result.fileName, result.cacheKey)
          }
        } else if (warehouseRestored.current) {
          if (!cancelled) setWarehouseBusy(false)
          return
        } else {
          db = await openBimDatabase()
          ingestWarehouse(db, store, spatialRoot, result.fileName, result.cacheKey)
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
        if (projectsAvailable() && project) {
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
  }, [store, spatialRoot, result, project, parsing])

  useEffect(() => {
    if (!warehouse || !quantities) return
    applyGeometryQuantities(warehouse, quantities)
    setReportTick((tick) => tick + 1)
  }, [warehouse, quantities])

  const load = useCallback(async (source: LoadSource) => {
    const gen = loadGen.current + 1
    loadGen.current = gen
    setHomeOpen(false)
    setBusy(true)
    setLoadingName(source.name)
    setParsing(true)
    setError(null)
    setSelectedId(null)
    setSelectedIds(new Set())
    setMeshes([])
    setResult(null)
    setStore(null)
    setSpatialRoot(null)
    setSourceBytes(null)
    setExportMessage(null)
    setQuantities(null)
    setQuantityBusy(false)
    setDisplayMode('all')
    setFocusIds(new Set())
    setHiddenIds(new Set())
    setTreeScopeIds(null)
    setActiveLens(null)
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
    setGroupKey(null)
    setBreakdownMode('type')
    setLeftTab('tree')
    setRightTab('properties')

    pendingMeshes.current = []
    if (meshRaf.current) {
      cancelAnimationFrame(meshRaf.current)
      meshRaf.current = 0
    }

    const flushMeshes = () => {
      const extra = pendingMeshes.current
      pendingMeshes.current = []
      meshRaf.current = 0
      if (loadGen.current !== gen || extra.length === 0) return
      setMeshes((current) => current.concat(extra))
    }

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

    const parserTask = resolveSourceBytes(source)
      .then((buffer) => {
        if (loadGen.current === gen) setSourceBytes(new Uint8Array(buffer))
        return buildDataStore(buffer, (partial) => {
          if (loadGen.current !== gen) return
          setStore(partial)
          setSpatialRoot(buildSpatialTreeFromStore(partial))
        })
      })
      .then((nextStore) => {
        if (loadGen.current !== gen) return
        setStore(nextStore)
        setSpatialRoot(buildSpatialTreeFromStore(nextStore))
      })
      .catch((caught) => {
        if (loadGen.current !== gen) return
        console.warn('IFC parser failed', caught)
      })
      .finally(() => {
        if (loadGen.current === gen) setParsing(false)
      })

    try {
      const next = await loadIfcModel(
        source,
        onProgress,
        (batch) => {
          if (loadGen.current !== gen) return
          pendingMeshes.current.push(...batch)
          if (meshRaf.current) return
          meshRaf.current = requestAnimationFrame(flushMeshes)
        },
      )
      if (meshRaf.current) cancelAnimationFrame(meshRaf.current)
      flushMeshes()
      if (loadGen.current !== gen) return
      setResult(next)
      setFitToken((token) => token + 1)
      const session = pendingSession.current
      pendingSession.current = null
      if (session && (!session.cacheKey || session.cacheKey === next.cacheKey)) {
        applySession(session)
      }
    } catch (caught) {
      if (loadGen.current !== gen) return
      const message = caught instanceof Error ? caught.message : String(caught)
      setError(message)
      setHomeOpen(true)
    } finally {
      if (loadGen.current === gen) setBusy(false)
      await parserTask
    }
  }, [applySession])

  const refreshProjects = useCallback(async () => {
    if (!projectsAvailable()) return
    setProjects(await listProjects())
  }, [])

  const onCreateProject = useCallback(
    async (name: string) => {
      try {
        const snapshot = await createProject(name)
        rememberSnapshot(snapshot, false)
        pendingSession.current = null
        pendingWarehouse.current = null
        loadGen.current += 1
        setMeshes([])
        setResult(null)
        setStore(null)
        setSpatialRoot(null)
        setWarehouse((current) => {
          closeBimDatabase(current)
          return null
        })
        setQuantities(null)
        setHomeOpen(true)
        await refreshProjects()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught))
      }
    },
    [rememberSnapshot, refreshProjects],
  )

  const onOpenProject = useCallback(
    async (id: string) => {
      try {
        const snapshot = await openProject(id)
        rememberSnapshot(snapshot)
        await refreshProjects()
        if (snapshot.modelPath) {
          await load({
            kind: 'path',
            name: snapshot.fileName ?? 'model.ifc',
            path: snapshot.modelPath,
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
      pendingWarehouse.current = null
      warehouseRestored.current = false
      if (source.kind === 'path') {
        const snapshot = await importIfcPath(source.path, source.name)
        rememberSnapshot(snapshot, false)
        if (!snapshot.modelPath) throw new Error('IFC was copied but the project path is missing.')
        await load({ kind: 'path', name: source.name, path: snapshot.modelPath })
        setHomeOpen(false)
        return
      }
      const snapshot = await importIfcBytes(source.name, source.bytes)
      rememberSnapshot(snapshot, false)
      if (!snapshot.modelPath) throw new Error('IFC was saved but the project path is missing.')
      await load({ kind: 'path', name: source.name, path: snapshot.modelPath })
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

  const onSample = useCallback(async () => {
    try {
      await importAndLoad(await loadSampleModel())
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
    setGroupKey(null)
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

  const empty = meshes.length === 0 && !busy
  const heading = useMemo(() => result?.fileName ?? null, [result])
  const selectedMeshes = useMemo(
    () => (selectedIds.size === 0 ? [] : meshes.filter((mesh) => selectedIds.has(mesh.expressId))),
    [meshes, selectedIds],
  )
  const mutationView = useMemo(() => (store ? createMutationView(store) : null), [store])

  useEffect(() => {
    if (!mutationView || mutationPatches.length === 0) return
    for (const patch of mutationPatches) {
      if (patch.kind === 'attribute') mutationView.setAttribute(patch.expressId, patch.name, patch.value)
      else if (patch.pset) mutationView.setProperty(patch.expressId, patch.pset, patch.name, patch.value)
    }
    setMutationTick((tick) => tick + 1)
  }, [mutationView, mutationPatches])
  const entity: EntityData | null = useMemo(() => {
    if (selectedId == null) return null
    const type =
      selectedMeshes.find((mesh) => mesh.expressId === selectedId)?.ifcType ??
      store?.entities.getTypeName(selectedId) ??
      'IfcProduct'
    const base = readEntity(store, selectedId, type)
    void mutationTick
    return mutationView ? overlayEntityData(base, mutationView) : base
  }, [selectedId, selectedMeshes, store, mutationView, mutationTick])

  const selectedEntities = useMemo(() => {
    void mutationTick
    if (selectedIds.size === 0) return []
    const typeById = new Map(selectedMeshes.map((mesh) => [mesh.expressId, mesh.ifcType]))
    return [...selectedIds].map((id) => {
      const type = typeById.get(id) ?? store?.entities.getTypeName(id) ?? 'IfcProduct'
      const base = readEntity(store, id, type)
      return mutationView ? overlayEntityData(base, mutationView) : base
    })
  }, [selectedIds, selectedMeshes, store, mutationView, mutationTick])

  const selectedLabel = useMemo(() => {
    if (selectedIds.size > 1) return `${selectedIds.size} selected`
    if (!entity) return null
    return entity.name ? `${entity.ifcType} (${entity.name})` : `${entity.ifcType} #${entity.expressId}`
  }, [entity, selectedIds])

  useEffect(() => {
    hoverLookupRef.current = (id: number) => {
      const type = store?.entities.getTypeName(id) ?? 'IfcProduct'
      const name = store?.entities.getName(id)
      return name ? `${type} ${name}` : `${type} #${id}`
    }
  }, [store])

  const onHover = useCallback((id: number | null) => {
    hoverBindRef.current?.(id)
  }, [])

  const queryState = useMemo(() => {
    if (!store || !isQueryActive(spec)) {
      return { rows: [], error: null as string | null, ids: null as Set<number> | null }
    }
    try {
      const rows = executeQuery(store, spec)
      return { rows, error: null as string | null, ids: queryIds(rows) }
    } catch (caught) {
      return {
        rows: [],
        error: caught instanceof Error ? caught.message : String(caught),
        ids: null as Set<number> | null,
      }
    }
  }, [store, spec])

  const queryApi = useMemo(() => (store ? createIfcQuery(store) : null), [store])
  const groups = useMemo(
    () => (queryState.ids ? buildBreakdown(queryState.rows, breakdownMode, queryApi) : []),
    [queryState.ids, queryState.rows, breakdownMode, queryApi],
  )

  const queryIsolatedIds = useMemo(() => {
    if (queryState.ids == null) return null
    if (groupKey) {
      const group = groups.find((item) => item.key === groupKey)
      if (group) return new Set(group.ids)
    }
    return queryState.ids
  }, [queryState.ids, groupKey, groups])

  const isolatedIds = useMemo(
    () => intersectIds(treeScopeIds, queryIsolatedIds),
    [treeScopeIds, queryIsolatedIds],
  )

  const lensResult: LensEvaluationResult | null = useMemo(() => {
    if (!store || !activeLens) return null
    return evaluateLens(activeLens, createLensProvider(store))
  }, [store, activeLens])

  const combinedHiddenIds = useMemo(() => {
    if (!lensResult || lensResult.hiddenIds.size === 0) return hiddenIds
    const next = new Set(hiddenIds)
    for (const id of lensResult.hiddenIds) next.add(id)
    return next
  }, [hiddenIds, lensResult])

  const allExpressIds = useMemo(() => meshes.map((mesh) => mesh.expressId), [meshes])
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

  const overlayFaces = useMemo(() => {
    if (!quantities || selectedIds.size === 0) return null
    const faces = quantities.elements
      .filter((item) => selectedIds.has(item.expressId))
      .flatMap((item) => item.faces)
    return faces.length > 0 ? faces : null
  }, [quantities, selectedIds])

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

  const onCalculateQuantities = useCallback(() => {
    if (selectedIds.size === 0) {
      setError('Select one or more elements, then click Calculate quantities.')
      return
    }
    const targetIds = new Set(selectedIds)
    setError(null)
    setQuantityBusy(true)
    setRightTab('quantities')
    setMobileTab('quantities')
    window.setTimeout(() => {
      try {
        const subset = meshesForQuantityJob(meshes, targetIds)
        const next = computeElementQuantities(subset, {
          targetIds,
          keepPositionsFor: targetIds,
        })
        setQuantities(next)
      } catch (caught) {
        setQuantities(null)
        setError(caught instanceof Error ? caught.message : String(caught))
      } finally {
        setQuantityBusy(false)
      }
    }, 0)
  }, [meshes, selectedIds])

  const quantitySummary = useMemo(() => {
    if (!quantities || selectedIds.size === 0) return null
    const picked = quantities.elements.filter((item) => selectedIds.has(item.expressId))
    if (picked.length === 0) return null
    const lateral = picked.reduce((sum, item) => sum + item.metrics.LATERALAREA, 0)
    const net = picked.reduce((sum, item) => sum + item.metrics.UNCOVEREDAREA, 0)
    return `LATERAL ${lateral.toFixed(2)} · NET ${net.toFixed(2)} m²`
  }, [quantities, selectedIds])

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
    matchCount: queryState.ids?.size ?? null,
    filterError: queryState.error,
    onSpecChange,
    groups,
    breakdownMode,
    queryActive: queryState.ids != null,
    selectedKey: groupKey,
    onModeChange: (mode: BreakdownMode) => {
      setBreakdownMode(mode)
      setGroupKey(null)
    },
    onSelectGroup: (group: (typeof groups)[number]) => {
      setGroupKey((current) => (current === group.key ? null : group.key))
      setLeftTab('breakdown')
      setMobileTab('breakdown')
    },
    onSelectId: (expressId: number, additive?: boolean) => onSelect(expressId, additive),
    onSelectScope,
    lensId: activeLens?.id ?? null,
    lensResult,
    onLensSelect: (lens: Lens | null) => {
      setActiveLens(lens)
      if (lens) {
        setLeftTab('lens')
        setMobileTab('lens')
      }
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
      onSample={onSample}
      dragActive={dragActive}
      projectsEnabled={desktopHost}
      projectsRoot={projectsRoot}
      projects={projects}
      currentProject={project}
      onCreateProject={(name) => void onCreateProject(name)}
      onOpenProject={(id) => void onOpenProject(id)}
      onDismiss={homeOpen && !empty ? () => setHomeOpen(false) : undefined}
    />
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <AppHeader
        fileName={heading}
        busy={busy}
        onOpen={onOpen}
        onSample={onSample}
        projectName={project?.name ?? null}
        onProjects={desktopHost ? () => setHomeOpen(true) : undefined}
        canLoad={!desktopHost || Boolean(project)}
      />
      {desktopHost && homeOpen ? (
        <div
          className="relative min-h-0 flex-1"
          onDragOver={(event) => {
            event.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
        >
          {projectHome}
        </div>
      ) : (
        <>
      <ToolStrip
        canFit={meshes.length > 0}
        matchCount={isolatedIds?.size ?? null}
        hasSelection={selectedIds.size > 0}
        displayMode={displayMode}
        hiddenCount={combinedHiddenIds.size}
        canShowAll={displayMode !== 'all' || hiddenIds.size > 0 || treeScopeIds != null}
        onFit={() => setFitToken((token) => token + 1)}
        onHide={onHideSelected}
        onGhost={onGhostSelected}
        onIsolate={onIsolateSelected}
        onShowAll={onShowAll}
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
          {(busy || (progress != null && progress.phase !== 'complete')) && (
            <LoadingOverlay progress={progress} parsing={parsing} fileName={loadingName ?? heading} />
          )}
          {empty ? projectHome : (
            <ViewerCanvas
              meshes={meshes}
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
              colorOverrides={lensResult?.colorMap ?? null}
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
        canCalculate={Boolean(result) && !busy && selectedIds.size > 0}
        quantityBusy={quantityBusy}
        quantitySummary={quantitySummary}
        onOpenQuantities={() => {
          setRightTab('quantities')
          setMobileTab('quantities')
        }}
        onCalculateQuantities={onCalculateQuantities}
      />
    </div>
  )
}

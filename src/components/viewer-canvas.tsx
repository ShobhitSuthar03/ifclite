import { memo, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { FaceQuantity } from '@/lib/geometry-qto'
import { FaceLayerLegend } from '@/components/face-layer-legend'
import { applyCameraFitBox } from '@/lib/fit-camera'
import type { ViewerMeshStore } from '@/lib/viewer-meshes'
import {
  ELEMENT_GHOST,
  ELEMENT_HIDDEN,
  ELEMENT_HOVER,
  ELEMENT_SELECTED,
  ELEMENT_SOLID,
  ViewerBatchGroup,
} from '@/lib/viewer-batches'
import {
  addBasketFaceOverlay,
  addQuantityFaceOverlay,
  buildFaceOutline,
  clearObject3d,
  toggleFaceLayer,
  type FaceLayer,
} from '@/lib/geometry-qto/overlay-mesh'
import { isAdditiveModifier } from '@/lib/selection'
import { VIEWPORT_THEME, type Theme } from '@/lib/theme'

const DRAG_THRESHOLD_PX = 4

function packedLook(hidden: boolean, selected: boolean, hovered: boolean, ghost: boolean): number {
  if (hidden) return ELEMENT_HIDDEN
  if (selected) return ELEMENT_SELECTED
  if (hovered) return ELEMENT_HOVER
  if (ghost) return ELEMENT_GHOST
  return ELEMENT_SOLID
}

type ViewerCanvasProps = {
  geometry: ViewerMeshStore
  geometryComplete: boolean
  onSceneReady?: () => void
  selectedIds: Set<number>
  isolatedIds: Set<number> | null
  hiddenIds: Set<number>
  ghostIds: Set<number>
  viewIsolateIds: Set<number> | null
  onSelect: (expressId: number | null, additive?: boolean) => void
  onHover?: (expressId: number | null) => void
  fitToken: number
  theme: Theme
  overlayFaces?: FaceQuantity[] | null
  colorOverrides?: Map<number, [number, number, number, number]> | null
  selectedFaceId?: string | null
  onSelectFace?: (faceId: string | null) => void
  /** Faces manually gathered into the takeoff "basket" - highlighted regardless of
   * Native/Calculated view, since building the basket doesn't require the QTO overlay. */
  basketFaces?: FaceQuantity[] | null
  /** Fires on every click with the raw hit geometry (not tied to the QTO overlay),
   * so the caller can match it against on-demand face data for basket picking. */
  onFaceCandidate?: (info: { expressId: number; point: [number, number, number]; normal: [number, number, number] } | null) => void
  onRegisterBasket?: (propertyName: string) => void
  onClearBasket?: () => void
}

export const ViewerCanvas = memo(function ViewerCanvas({
  geometry,
  geometryComplete,
  onSceneReady,
  selectedIds,
  isolatedIds,
  hiddenIds,
  ghostIds,
  viewIsolateIds,
  onSelect,
  onHover,
  fitToken,
  theme,
  overlayFaces = null,
  colorOverrides = null,
  selectedFaceId = null,
  onSelectFace,
  basketFaces = null,
  onFaceCandidate,
  onRegisterBasket,
  onClearBasket,
}: ViewerCanvasProps) {
  const [faceLayers, setFaceLayers] = useState<Set<FaceLayer>>(() => new Set(['all']))
  const [propertyName, setPropertyName] = useState('')
  const [meshPump, setMeshPump] = useState(0)
  const onSceneReadyRef = useRef(onSceneReady)

  useEffect(() => {
    if (!geometryComplete) return
    return geometry.subscribe(() => setMeshPump((tick) => tick + 1))
  }, [geometry, geometryComplete])
  const meshes = geometry.list()

  useEffect(() => {
    setFaceLayers(new Set(['all']))
  }, [selectedIds])

  // Elements currently shown by the overlay - independent of selection, since the
  // overlay reflects the last calculation, not the current pick.
  const overlayIds = useMemo(() => {
    if (!overlayFaces || overlayFaces.length === 0) return null
    const ids = new Set<number>()
    for (const face of overlayFaces) ids.add(face.expressId)
    return ids
  }, [overlayFaces])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const modelGroupRef = useRef<THREE.Group | null>(null)
  const overlayGroupRef = useRef<THREE.Group | null>(null)
  const basketGroupRef = useRef<THREE.Group | null>(null)
  const gridRef = useRef<THREE.GridHelper | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const meshIndexRef = useRef(0)
  const batcherRef = useRef<ViewerBatchGroup | null>(null)
  const selectedIdsRef = useRef(selectedIds)
  const hoveredRef = useRef<number | null>(null)
  const isolatedRef = useRef<Set<number> | null>(null)
  const hiddenRef = useRef<Set<number>>(new Set())
  const ghostRef = useRef<Set<number>>(new Set())
  const viewIsolateRef = useRef<Set<number> | null>(null)
  const overlayIdsRef = useRef<Set<number> | null>(null)
  const geometryCompleteRef = useRef(geometryComplete)
  const onSelectRef = useRef(onSelect)
  const onHoverRef = useRef(onHover)
  const onSelectFaceRef = useRef(onSelectFace)
  const onFaceCandidateRef = useRef(onFaceCandidate)
  const requestRenderRef = useRef<() => void>(() => {})
  const themeRef = useRef(theme)
  const appliedThemeRef = useRef<Theme | null>(null)
  const faceOutlineRef = useRef<THREE.LineSegments | null>(null)

  useEffect(() => {
    onSelectRef.current = onSelect
    onHoverRef.current = onHover
    onSelectFaceRef.current = onSelectFace
    onFaceCandidateRef.current = onFaceCandidate
    onSceneReadyRef.current = onSceneReady
    isolatedRef.current = isolatedIds
    hiddenRef.current = hiddenIds
    ghostRef.current = ghostIds
    viewIsolateRef.current = viewIsolateIds
    geometryCompleteRef.current = geometryComplete
  }, [onSelect, onHover, onSelectFace, onFaceCandidate, onSceneReady, isolatedIds, hiddenIds, ghostIds, viewIsolateIds, geometryComplete])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const softwareGpu = isSoftwareGpu()
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !softwareGpu,
      alpha: false,
      powerPreference: softwareGpu ? 'low-power' : 'high-performance',
      logarithmicDepthBuffer: false,
    })
    renderer.setPixelRatio(1)
    const colors = VIEWPORT_THEME[themeRef.current]
    renderer.setClearColor(colors.clear, 1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NoToneMapping
    renderer.toneMappingExposure = 1
    renderer.sortObjects = false

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(colors.clear)

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000)
    camera.position.set(20, 15, 20)

    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = false
    controls.screenSpacePanning = true
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    }
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    }
    controls.target.set(0, 1.2, 0)

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const key = new THREE.DirectionalLight(0xffffff, 0.8)
    key.position.set(50, 80, 50)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xb0c4de, 0.3)
    fill.position.set(-30, 10, -20)
    scene.add(fill)

    const grid = new THREE.GridHelper(60, 30, colors.gridMajor, colors.gridMinor)
    grid.position.y = 0
    scene.add(grid)

    const modelGroup = new THREE.Group()
    modelGroup.name = 'ifc-model'
    scene.add(modelGroup)
    const batcher = new ViewerBatchGroup()
    modelGroup.add(batcher.object)
    batcherRef.current = batcher
    const overlayGroup = new THREE.Group()
    overlayGroup.name = 'qto-overlay'
    overlayGroup.renderOrder = 2
    scene.add(overlayGroup)
    const basketGroup = new THREE.Group()
    basketGroup.name = 'qto-basket'
    basketGroup.renderOrder = 3
    scene.add(basketGroup)

    cameraRef.current = camera
    rendererRef.current = renderer
    controlsRef.current = controls
    modelGroupRef.current = modelGroup
    overlayGroupRef.current = overlayGroup
    basketGroupRef.current = basketGroup
    gridRef.current = grid
    sceneRef.current = scene
    appliedThemeRef.current = themeRef.current
    meshIndexRef.current = 0

    let frame = 0
    let dirty = true
    const requestRender = () => {
      dirty = true
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (!dirty) return
        dirty = false
        renderer.render(scene, camera)
      })
    }
    requestRenderRef.current = requestRender

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const width = parent.clientWidth
      const height = parent.clientHeight
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
      requestRender()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas.parentElement ?? canvas)
    controls.addEventListener('change', requestRender)

    let pointerDownX = 0
    let pointerDownY = 0
    let didDrag = false
    let hoverRaf = 0
    let lastHoverAt = 0

    const lookOf = (id: number, hoveredId: number | null) => {
      const overlayOn = overlayIdsRef.current != null && overlayIdsRef.current.has(id)
      const hidden =
        hiddenRef.current.has(id) || (viewIsolateRef.current != null && !viewIsolateRef.current.has(id))
      const ghost =
        !hidden && (ghostRef.current.has(id) || overlayOn || (isolatedRef.current != null && !isolatedRef.current.has(id)))
      const selected = selectedIdsRef.current.has(id) && !overlayOn
      return packedLook(hidden, selected, hoveredId === id && !selected, ghost)
    }

    const setElementLook = (id: number | null, hoveredId: number | null) => {
      if (id == null) return
      batcher.setElementState(id, lookOf(id, hoveredId))
      requestRender()
    }

    const raycaster = new THREE.Raycaster()
    raycaster.layers.enableAll()
    const pointer = new THREE.Vector2()
    type Pick = {
      expressId: number
      faceId: string | null
      point?: [number, number, number]
      normal?: [number, number, number]
    }
    const pickAt = (clientX: number, clientY: number): Pick | null => {
      const rect = canvas.getBoundingClientRect()
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(pointer, camera)
      const isolated = isolatedRef.current
      const hidden = hiddenRef.current
      const ghost = ghostRef.current
      const viewIsolate = viewIsolateRef.current
      const passes = (id: number) => {
        if (hidden.has(id) || ghost.has(id)) return false
        if (viewIsolate && !viewIsolate.has(id)) return false
        if (isolated && !isolated.has(id)) return false
        return true
      }
      if (overlayGroup.children.length > 0) {
        const overlayHits = raycaster.intersectObjects(overlayGroup.children, false)
        const overlayHit = overlayHits.find((item) => {
          const id = item.object.userData.expressId as number | undefined
          return id != null && passes(id)
        })
        if (overlayHit) {
          const expressId = overlayHit.object.userData.expressId as number
          const faceId = (overlayHit.object.userData.faceId as string | undefined) ?? null
          return { expressId, faceId }
        }
      }
      const modelHits = raycaster.intersectObjects(batcher.drawMeshes, false)
      for (const hit of modelHits) {
        if (hit.faceIndex == null) continue
        const expressId = batcher.expressIdAt(hit.object, hit.faceIndex)
        if (expressId == null || !passes(expressId)) continue
        const point: [number, number, number] = [hit.point.x, hit.point.y, hit.point.z]
        const localNormal = hit.face?.normal
        let normal: [number, number, number] | undefined
        if (localNormal) {
          const worldNormal = localNormal.clone().transformDirection(hit.object.matrixWorld).normalize()
          normal = [worldNormal.x, worldNormal.y, worldNormal.z]
        }
        return { expressId, faceId: null, point, normal }
      }
      return null
    }

    const onPointerDown = (event: PointerEvent) => {
      pointerDownX = event.clientX
      pointerDownY = event.clientY
      didDrag = false
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.buttons !== 0) {
        if (!didDrag) {
          const dist = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY)
          if (dist > DRAG_THRESHOLD_PX) {
            didDrag = true
            canvas.classList.add('dragging')
            canvas.classList.remove('hovering')
          }
        }
        return
      }
      if (hoverRaf) return
      if (!geometryCompleteRef.current) return
      const now = performance.now()
      if (now - lastHoverAt < 80) return
      lastHoverAt = now
      const cx = event.clientX
      const cy = event.clientY
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = 0
        const id = pickAt(cx, cy)?.expressId ?? null
        canvas.classList.toggle('hovering', id != null)
        if (id === hoveredRef.current) return
        if (hoveredRef.current != null) setElementLook(hoveredRef.current, null)
        hoveredRef.current = id
        if (id != null) setElementLook(id, id)
        onHoverRef.current?.(id)
      })
    }

    const onPointerUp = () => {
      canvas.classList.remove('dragging')
    }

    const onPointerLeave = () => {
      canvas.classList.remove('dragging', 'hovering')
      if (hoveredRef.current != null) setElementLook(hoveredRef.current, null)
      hoveredRef.current = null
      onHoverRef.current?.(null)
    }

    const onClick = (event: MouseEvent) => {
      if (didDrag) return
      const hit = pickAt(event.clientX, event.clientY)
      onSelectRef.current(hit?.expressId ?? null, isAdditiveModifier(event))
      onSelectFaceRef.current?.(hit?.faceId ?? null)
      if (hit && hit.point && hit.normal) {
        onFaceCandidateRef.current?.({ expressId: hit.expressId, point: hit.point, normal: hit.normal })
      } else {
        onFaceCandidateRef.current?.(null)
      }
    }

    const onContextMenu = (event: Event) => {
      event.preventDefault()
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.addEventListener('click', onClick)
    canvas.addEventListener('contextmenu', onContextMenu)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      if (hoverRaf) cancelAnimationFrame(hoverRaf)
      observer.disconnect()
      controls.removeEventListener('change', requestRender)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('contextmenu', onContextMenu)
      controls.dispose()
      batcher.dispose()
      batcherRef.current = null
      renderer.dispose()
      scene.clear()
      meshIndexRef.current = 0
      overlayGroupRef.current = null
      basketGroupRef.current = null
    }
  }, [])

  useEffect(() => {
    const renderer = rendererRef.current
    const scene = sceneRef.current
    const grid = gridRef.current
    if (!renderer || !scene || !grid) return
    if (appliedThemeRef.current === theme) return
    appliedThemeRef.current = theme
    const colors = VIEWPORT_THEME[theme]
    renderer.setClearColor(colors.clear, 1)
    scene.background = new THREE.Color(colors.clear)
    const next = new THREE.GridHelper(60, 30, colors.gridMajor, colors.gridMinor)
    next.position.copy(grid.position)
    next.scale.copy(grid.scale)
    scene.remove(grid)
    grid.geometry.dispose()
    const material = grid.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose())
    else material.dispose()
    scene.add(next)
    gridRef.current = next
    requestRenderRef.current()
  }, [theme])

  useEffect(() => {
    const batcher = batcherRef.current
    if (!batcher) return

    const revision = geometry.revision()
    if ((batcher.object.userData.revision as number | undefined) !== revision) {
      batcher.clear()
      meshIndexRef.current = 0
      batcher.object.userData.revision = revision
      requestRenderRef.current()
    }

    if (!geometryComplete || meshes.length === 0) return

    const budget = 120
    const end = Math.min(meshes.length, meshIndexRef.current + budget)
    if (end > meshIndexRef.current) {
      batcher.addRange(meshes, meshIndexRef.current, end)
      meshIndexRef.current = end
      requestRenderRef.current()
    }
    if (end < meshes.length) {
      const frame = requestAnimationFrame(() => setMeshPump((tick) => tick + 1))
      return () => cancelAnimationFrame(frame)
    }
    onSceneReadyRef.current?.()
  }, [meshes, meshPump, geometryComplete, geometry])

  useEffect(() => {
    isolatedRef.current = isolatedIds
    hiddenRef.current = hiddenIds
    ghostRef.current = ghostIds
    viewIsolateRef.current = viewIsolateIds
    overlayIdsRef.current = overlayIds
    const batcher = batcherRef.current
    if (!batcher) return
    for (const id of geometry.ids()) {
      const overlayOn = overlayIds != null && overlayIds.has(id)
      const hidden = hiddenIds.has(id) || (viewIsolateIds != null && !viewIsolateIds.has(id))
      const ghost =
        !hidden && (ghostIds.has(id) || overlayOn || (isolatedIds != null && !isolatedIds.has(id)))
      const selected = selectedIds.has(id) && !overlayOn
      const hovered = hoveredRef.current === id && !selected
      batcher.setElementState(id, packedLook(hidden, selected, hovered, ghost))
      const override = colorOverrides?.get(id)
      batcher.setElementColor(id, override ? [override[0], override[1], override[2]] : null)
    }
    requestRenderRef.current()
  }, [isolatedIds, hiddenIds, ghostIds, viewIsolateIds, overlayIds, colorOverrides, geometryComplete, geometry, selectedIds])

  useEffect(() => {
    selectedIdsRef.current = selectedIds
  }, [selectedIds])

  useEffect(() => {
    const group = overlayGroupRef.current
    if (!group) return
    clearObject3d(group)
    faceOutlineRef.current = null
    if (overlayFaces && overlayFaces.length > 0) {
      for (const face of overlayFaces) addQuantityFaceOverlay(group, face, faceLayers)
    }
    requestRenderRef.current()
    return () => {
      clearObject3d(group)
      faceOutlineRef.current = null
    }
  }, [overlayFaces, selectedIds, faceLayers])

  useEffect(() => {
    const group = overlayGroupRef.current
    if (!group) return
    if (faceOutlineRef.current) {
      group.remove(faceOutlineRef.current)
      faceOutlineRef.current.geometry.dispose()
      const material = faceOutlineRef.current.material
      if (Array.isArray(material)) material.forEach((item) => item.dispose())
      else material.dispose()
      faceOutlineRef.current = null
    }
    if (selectedFaceId) {
      const target = group.children.find(
        (child): child is THREE.Mesh => child instanceof THREE.Mesh && child.userData.faceId === selectedFaceId,
      )
      if (target) {
        const outline = buildFaceOutline(target)
        group.add(outline)
        faceOutlineRef.current = outline
      }
    }
    requestRenderRef.current()
  }, [selectedFaceId, overlayFaces, faceLayers])

  useEffect(() => {
    const group = basketGroupRef.current
    if (!group) return
    clearObject3d(group)
    if (basketFaces) {
      for (const face of basketFaces) addBasketFaceOverlay(group, face)
    }
    requestRenderRef.current()
    return () => {
      clearObject3d(group)
    }
  }, [basketFaces])

  useEffect(() => {
    const batcher = batcherRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    const grid = gridRef.current
    if (!batcher || !camera || !controls || batcher.box.isEmpty()) return
    if (!geometryComplete && fitToken === 0) return
    const fitted = applyCameraFitBox(camera, controls, batcher.box)
    if (!fitted || !grid) return
    grid.position.y = batcher.box.min.y
    const scale = Math.max(fitted.maxDim * 2, 8) / 60
    grid.scale.setScalar(scale)
    requestRenderRef.current()
  }, [fitToken, geometryComplete])

  const basketTotals = useMemo(() => {
    if (!basketFaces || basketFaces.length === 0) return null
    let gross = 0
    let net = 0
    for (const face of basketFaces) {
      gross += face.grossArea
      net += face.netArea
    }
    return { gross, net, count: basketFaces.length }
  }, [basketFaces])

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="ifc-orbit block h-full w-full" />
      {overlayFaces && overlayFaces.length > 0 ? (
        <FaceLayerLegend
          faces={overlayFaces}
          layers={faceLayers}
          onToggle={(layer) => setFaceLayers((current) => toggleFaceLayer(current, layer))}
        />
      ) : null}
      {basketTotals ? (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-card/95 px-3 py-2 text-[12px] shadow-lg backdrop-blur">
          <span className="font-medium">
            {basketTotals.count} face{basketTotals.count === 1 ? '' : 's'} selected
          </span>
          <span className="text-muted-foreground">
            gross {basketTotals.gross.toFixed(3)} m² · net {basketTotals.net.toFixed(3)} m²
          </span>
          <input
            type="text"
            value={propertyName}
            onChange={(event) => setPropertyName(event.target.value)}
            placeholder="Property name"
            aria-label="Property name"
            className="h-7 w-36 rounded border border-border bg-background px-2 text-[11px] text-foreground"
          />
          <button
            type="button"
            className="rounded bg-primary px-2 py-1 text-[11px] font-semibold text-white hover:bg-primary/90 disabled:opacity-40"
            disabled={!propertyName.trim()}
            onClick={() => onRegisterBasket?.(propertyName)}
          >
            Register as property
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
            onClick={onClearBasket}
          >
            Clear
          </button>
        </div>
      ) : null}
    </div>
  )
})

function isSoftwareGpu(): boolean {
  try {
    const probe = document.createElement('canvas')
    const gl =
      probe.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) ??
      probe.getContext('webgl', { failIfMajorPerformanceCaveat: false })
    if (!gl) return true
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '') : ''
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(gpu)
  } catch {
    return false
  }
}

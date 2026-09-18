import { memo, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Scissors } from 'lucide-react'
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
import { applyClickSelection, isAdditiveModifier, setsEqual, touchedSelectionIds } from '@/lib/selection'
import { VIEWPORT_THEME, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'

const DRAG_THRESHOLD_PX = 4

type SectionAxis = 'x' | '-x' | 'y' | '-y' | 'z' | '-z'
const SECTION_AXES: SectionAxis[] = ['x', '-x', 'y', '-y', 'z', '-z']
const SECTION_AXIS_INDEX: Record<SectionAxis, 0 | 1 | 2> = { x: 0, '-x': 0, y: 1, '-y': 1, z: 2, '-z': 2 }
const SECTION_AXIS_SIGN: Record<SectionAxis, 1 | -1> = { x: 1, '-x': -1, y: 1, '-y': -1, z: 1, '-z': -1 }

function packedLook(hidden: boolean, selected: boolean, hovered: boolean, ghost: boolean): number {
  if (hidden) return ELEMENT_HIDDEN
  if (selected) return ELEMENT_SELECTED
  if (hovered) return ELEMENT_HOVER
  if (ghost) return ELEMENT_GHOST
  return ELEMENT_SOLID
}

function lookForId(
  id: number,
  hoveredId: number | null,
  selectedIds: Set<number>,
  isolatedIds: Set<number> | null,
  hiddenIds: Set<number>,
  ghostIds: Set<number>,
  viewIsolateIds: Set<number> | null,
  overlayIds: Set<number> | null,
): number {
  const overlayOn = overlayIds != null && overlayIds.has(id)
  const hidden = hiddenIds.has(id) || (viewIsolateIds != null && !viewIsolateIds.has(id))
  const ghost =
    !hidden && (ghostIds.has(id) || overlayOn || (isolatedIds != null && !isolatedIds.has(id)))
  const selected = selectedIds.has(id) && !overlayOn
  return packedLook(hidden, selected, hoveredId === id && !selected, ghost)
}

function rgbChanged(
  previous: [number, number, number, number] | undefined,
  next: [number, number, number, number] | undefined,
): boolean {
  if (previous == null && next == null) return false
  if (previous == null || next == null) return true
  return previous[0] !== next[0] || previous[1] !== next[1] || previous[2] !== next[2]
}

function touchedSimLookIds(
  previousIsolate: Set<number>,
  nextIsolate: Set<number>,
  previousColors: Map<number, [number, number, number, number]>,
  nextColors: Map<number, [number, number, number, number]>,
): Set<number> {
  const touched = new Set<number>()
  for (const id of previousIsolate) if (!nextIsolate.has(id)) touched.add(id)
  for (const id of nextIsolate) if (!previousIsolate.has(id)) touched.add(id)
  for (const [id, color] of nextColors) {
    if (rgbChanged(previousColors.get(id), color)) touched.add(id)
  }
  for (const id of previousColors.keys()) if (!nextColors.has(id)) touched.add(id)
  return touched
}

type ViewerCanvasProps = {
  geometry: ViewerMeshStore
  geometryComplete: boolean
  onSceneReady?: () => void
  selectedIds: Set<number>
  isolatedIds: Set<number> | null
  hiddenIds: Set<number>
  /** expressIds of a whole IFC type to leave out of the render entirely (e.g.
   * opening voids, space volumes) — resolved by type name upstream, since the
   * desktop app's packed geometry transport doesn't carry per-mesh ifcType.
   * A category-level hide, distinct from `hiddenIds`' per-element one. */
  hiddenTypeIds: ReadonlySet<number>
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
  /** Right-click context menu actions - mirror the ToolStrip buttons. */
  onShowAll: () => void
  onHideSelected: () => void
  onIsolateSelected: () => void
}

export const ViewerCanvas = memo(function ViewerCanvas({
  geometry,
  geometryComplete,
  onSceneReady,
  selectedIds,
  isolatedIds,
  hiddenIds,
  hiddenTypeIds,
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
  onShowAll,
  onHideSelected,
  onIsolateSelected,
}: ViewerCanvasProps) {
  const [faceLayers, setFaceLayers] = useState<Set<FaceLayer>>(() => new Set(['all']))
  const [propertyName, setPropertyName] = useState('')
  const [meshPump, setMeshPump] = useState(0)
  const onSceneReadyRef = useRef(onSceneReady)
  const appliedHiddenTypeIdsRef = useRef<ReadonlySet<number> | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; hasSelection: boolean } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [sectionEnabled, setSectionEnabled] = useState(false)
  const [sectionAxis, setSectionAxis] = useState<SectionAxis>('z')
  const [sectionRatio, setSectionRatio] = useState(0.5)

  useEffect(() => {
    if (!geometryComplete) return
    return geometry.subscribe(() => setMeshPump((tick) => tick + 1))
  }, [geometry, geometryComplete])
  const meshes = geometry.list().filter((mesh) => !hiddenTypeIds.has(mesh.expressId))

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
  const sceneRef = useRef<THREE.Scene | null>(null)
  const meshIndexRef = useRef(0)
  const batcherRef = useRef<ViewerBatchGroup | null>(null)
  const selectedIdsRef = useRef(selectedIds)
  const prevSelectedRef = useRef(selectedIds)
  const hoveredRef = useRef<number | null>(null)
  const isolatedRef = useRef<Set<number> | null>(null)
  const hiddenRef = useRef<Set<number>>(new Set())
  const ghostRef = useRef<Set<number>>(new Set())
  const viewIsolateRef = useRef<Set<number> | null>(null)
  const overlayIdsRef = useRef<Set<number> | null>(null)
  const prevSimIsolateRef = useRef<Set<number> | null>(null)
  const prevSimColorsRef = useRef<Map<number, [number, number, number, number]> | null>(null)
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
    renderer.localClippingEnabled = true

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

    const lookOf = (id: number, hoveredId: number | null) =>
      lookForId(
        id,
        hoveredId,
        selectedIdsRef.current,
        isolatedRef.current,
        hiddenRef.current,
        ghostRef.current,
        viewIsolateRef.current,
        overlayIdsRef.current,
      )

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
      setContextMenu(null)
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
      const additive = isAdditiveModifier(event)
      const next = applyClickSelection(selectedIdsRef.current, hit?.expressId ?? null, additive)
      if (!setsEqual(next, selectedIdsRef.current)) {
        const previous = selectedIdsRef.current
        selectedIdsRef.current = next
        for (const id of touchedSelectionIds(previous, next)) setElementLook(id, hoveredRef.current)
      }
      onSelectRef.current(hit?.expressId ?? null, additive)
      onSelectFaceRef.current?.(hit?.faceId ?? null)
      if (hit && hit.point && hit.normal) {
        onFaceCandidateRef.current?.({ expressId: hit.expressId, point: hit.point, normal: hit.normal })
      } else {
        onFaceCandidateRef.current?.(null)
      }
    }

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault()
      if (didDrag) return
      // Rough menu footprint so it doesn't hang off the right/bottom edge.
      const x = Math.min(event.clientX, window.innerWidth - 160)
      const y = Math.min(event.clientY, window.innerHeight - 110)
      setContextMenu({ x, y, hasSelection: selectedIdsRef.current.size > 0 })
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
    if (!renderer || !scene) return
    if (appliedThemeRef.current === theme) return
    appliedThemeRef.current = theme
    const colors = VIEWPORT_THEME[theme]
    renderer.setClearColor(colors.clear, 1)
    scene.background = new THREE.Color(colors.clear)
    requestRenderRef.current()
  }, [theme])

  useEffect(() => {
    const batcher = batcherRef.current
    if (!batcher) return

    const revision = geometry.revision()
    // The batcher only ever appends, so excluding a type (opening/space
    // visibility) after its meshes are already on the GPU needs a full
    // rebuild — a plain revision check misses this because the type index
    // (`hiddenTypeIds`) usually only resolves *after* the first full pump,
    // once `store` parses in the background (issue: streaming avoids OOM by
    // deferring that parse until triangles are already on screen).
    const hiddenTypesChanged = appliedHiddenTypeIdsRef.current !== hiddenTypeIds
    if ((batcher.object.userData.revision as number | undefined) !== revision || hiddenTypesChanged) {
      batcher.clear()
      meshIndexRef.current = 0
      batcher.object.userData.revision = revision
      appliedHiddenTypeIdsRef.current = hiddenTypeIds
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
  }, [meshes, meshPump, geometryComplete, geometry, hiddenTypeIds])

  // A new model can be a completely different size, so a plane positioned by
  // fraction-of-bounds from the last one would land somewhere meaningless.
  useEffect(() => {
    if (fitToken === 0) return
    setSectionEnabled(false)
    setSectionRatio(0.5)
  }, [fitToken])

  useEffect(() => {
    const batcher = batcherRef.current
    if (!batcher) return
    if (!sectionEnabled || batcher.box.isEmpty()) {
      batcher.setClippingPlanes([])
      requestRenderRef.current()
      return
    }
    const axisIndex = SECTION_AXIS_INDEX[sectionAxis]
    const min = batcher.box.min.getComponent(axisIndex)
    const max = batcher.box.max.getComponent(axisIndex)
    const value = min + (max - min) * sectionRatio
    const normal = new THREE.Vector3()
    normal.setComponent(axisIndex, SECTION_AXIS_SIGN[sectionAxis])
    const pointOnPlane = new THREE.Vector3()
    pointOnPlane.setComponent(axisIndex, value)
    const plane = new THREE.Plane(normal, -normal.dot(pointOnPlane))
    batcher.setClippingPlanes([plane])
    requestRenderRef.current()
  }, [sectionEnabled, sectionAxis, sectionRatio, geometryComplete])

  useEffect(() => {
    if (!contextMenu) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null)
    }
    const onWindowPointerDown = (event: PointerEvent) => {
      if (contextMenuRef.current?.contains(event.target as Node)) return
      setContextMenu(null)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onWindowPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onWindowPointerDown)
    }
  }, [contextMenu])

  useEffect(() => {
    isolatedRef.current = isolatedIds
    hiddenRef.current = hiddenIds
    ghostRef.current = ghostIds
    viewIsolateRef.current = viewIsolateIds
    overlayIdsRef.current = overlayIds
    const batcher = batcherRef.current
    if (!batcher) return
    const previousIsolate = prevSimIsolateRef.current
    const previousColors = prevSimColorsRef.current
    const canDelta =
      previousIsolate != null &&
      viewIsolateIds != null &&
      previousColors != null &&
      colorOverrides != null
    const ids = canDelta
      ? touchedSimLookIds(previousIsolate, viewIsolateIds, previousColors, colorOverrides)
      : geometry.ids()
    for (const id of ids) {
      batcher.setElementState(
        id,
        lookForId(
          id,
          hoveredRef.current,
          selectedIdsRef.current,
          isolatedIds,
          hiddenIds,
          ghostIds,
          viewIsolateIds,
          overlayIds,
        ),
      )
      const override = colorOverrides?.get(id)
      batcher.setElementColor(id, override ? [override[0], override[1], override[2]] : null)
    }
    prevSimIsolateRef.current = viewIsolateIds
    prevSimColorsRef.current = colorOverrides ?? null
    requestRenderRef.current()
  }, [isolatedIds, hiddenIds, ghostIds, viewIsolateIds, overlayIds, colorOverrides, geometryComplete, geometry])

  useEffect(() => {
    const previous = prevSelectedRef.current
    prevSelectedRef.current = selectedIds
    selectedIdsRef.current = selectedIds
    const batcher = batcherRef.current
    if (!batcher) return
    for (const id of touchedSelectionIds(previous, selectedIds)) {
      batcher.setElementState(
        id,
        lookForId(
          id,
          hoveredRef.current,
          selectedIds,
          isolatedRef.current,
          hiddenRef.current,
          ghostRef.current,
          viewIsolateRef.current,
          overlayIdsRef.current,
        ),
      )
    }
    requestRenderRef.current()
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
  }, [overlayFaces, faceLayers])

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
      for (const face of basketFaces) {
        const baseMesh = geometry.meshesForIds(new Set([face.expressId]))[0]
        const baseColor = baseMesh?.color
          ? ([baseMesh.color[0], baseMesh.color[1], baseMesh.color[2]] as [number, number, number])
          : undefined
        addBasketFaceOverlay(group, face, baseColor)
      }
    }
    requestRenderRef.current()
    return () => {
      clearObject3d(group)
    }
  }, [basketFaces, geometry])

  useEffect(() => {
    const batcher = batcherRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!batcher || !camera || !controls || batcher.box.isEmpty()) return
    if (!geometryComplete && fitToken === 0) return
    const isolate = viewIsolateRef.current
    const box = isolate && isolate.size > 0 ? batcher.boxForIds(isolate) : batcher.box
    if (box.isEmpty()) return
    applyCameraFitBox(camera, controls, box)
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
      <div className="absolute top-3 right-3 flex w-fit flex-col gap-1 rounded-md border border-border bg-card/95 px-1.5 py-1 text-[11px] shadow-lg backdrop-blur">
        <div className="flex items-center gap-1">
          <button
            type="button"
            title={sectionEnabled ? 'Turn off section' : 'Cut a section through the model'}
            className={cn(
              'flex h-7 items-center gap-1 rounded px-2 text-foreground hover:bg-accent',
              sectionEnabled && 'bg-primary/20 text-primary',
            )}
            onClick={() => setSectionEnabled((value) => !value)}
          >
            <Scissors className="h-3.5 w-3.5" />
            <span>Section</span>
          </button>
          {sectionEnabled ? (
            <>
              <span className="mx-0.5 h-5 w-px bg-border" />
              {SECTION_AXES.map((axis) => (
                <button
                  key={axis}
                  type="button"
                  title={`Cut along ${axis.toUpperCase()}`}
                  className={cn(
                    'flex h-7 w-6 items-center justify-center rounded text-foreground hover:bg-accent',
                    sectionAxis === axis && 'bg-primary/20 text-primary',
                  )}
                  onClick={() => setSectionAxis(axis)}
                >
                  {axis.toUpperCase()}
                </button>
              ))}
            </>
          ) : null}
        </div>
        {sectionEnabled ? (
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={sectionRatio}
            onChange={(event) => setSectionRatio(Number(event.target.value))}
            className="w-full"
            aria-label="Section position"
          />
        ) : null}
      </div>
      {contextMenu ? (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-36 rounded-md border border-border bg-card py-1 text-[12px] shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left hover:bg-accent"
            onClick={() => {
              onShowAll()
              setContextMenu(null)
            }}
          >
            Show all
          </button>
          <button
            type="button"
            disabled={!contextMenu.hasSelection}
            className="block w-full px-3 py-1.5 text-left hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
            onClick={() => {
              onHideSelected()
              setContextMenu(null)
            }}
          >
            Hide selected
          </button>
          <button
            type="button"
            disabled={!contextMenu.hasSelection}
            className="block w-full px-3 py-1.5 text-left hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
            onClick={() => {
              onIsolateSelected()
              setContextMenu(null)
            }}
          >
            Isolate selected
          </button>
        </div>
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

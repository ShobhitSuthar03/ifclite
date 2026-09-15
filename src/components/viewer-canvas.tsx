import { memo, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { MeshData } from '@ifc-lite/geometry'
import type { FaceQuantity } from '@/lib/geometry-qto'
import { FaceLayerLegend } from '@/components/face-layer-legend'
import { applyCameraFit } from '@/lib/fit-camera'
import { addQuantityFaceOverlay, clearObject3d, toggleFaceLayer, type FaceLayer } from '@/lib/geometry-qto/overlay-mesh'
import { meshDataToThree } from '@/lib/mesh-to-three'
import { isAdditiveModifier } from '@/lib/selection'
import { VIEWPORT_THEME, type Theme } from '@/lib/theme'

const DRAG_THRESHOLD_PX = 4

type ViewerCanvasProps = {
  meshes: MeshData[]
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
}

export const ViewerCanvas = memo(function ViewerCanvas({
  meshes,
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
}: ViewerCanvasProps) {
  const [faceLayers, setFaceLayers] = useState<Set<FaceLayer>>(() => new Set(['all']))

  useEffect(() => {
    setFaceLayers(new Set(['all']))
  }, [selectedIds])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const modelGroupRef = useRef<THREE.Group | null>(null)
  const overlayGroupRef = useRef<THREE.Group | null>(null)
  const gridRef = useRef<THREE.GridHelper | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const meshIndexRef = useRef(0)
  const meshById = useRef(new Map<number, THREE.Mesh[]>())
  const selectedIdsRef = useRef(selectedIds)
  const hoveredRef = useRef<number | null>(null)
  const isolatedRef = useRef<Set<number> | null>(null)
  const hiddenRef = useRef<Set<number>>(new Set())
  const ghostRef = useRef<Set<number>>(new Set())
  const viewIsolateRef = useRef<Set<number> | null>(null)
  const onSelectRef = useRef(onSelect)
  const onHoverRef = useRef(onHover)
  const requestRenderRef = useRef<() => void>(() => {})
  const themeRef = useRef(theme)
  const appliedThemeRef = useRef<Theme | null>(null)

  useEffect(() => {
    onSelectRef.current = onSelect
    onHoverRef.current = onHover
    isolatedRef.current = isolatedIds
    hiddenRef.current = hiddenIds
    ghostRef.current = ghostIds
    viewIsolateRef.current = viewIsolateIds
  }, [onSelect, onHover, isolatedIds, hiddenIds, ghostIds, viewIsolateIds])

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
    const pixelRatio = softwareGpu ? 1 : Math.min(window.devicePixelRatio || 1, 1.25)
    renderer.setPixelRatio(pixelRatio)
    const colors = VIEWPORT_THEME[themeRef.current]
    renderer.setClearColor(colors.clear, 1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = softwareGpu ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1

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
    const overlayGroup = new THREE.Group()
    overlayGroup.name = 'qto-overlay'
    overlayGroup.renderOrder = 2
    scene.add(overlayGroup)

    cameraRef.current = camera
    rendererRef.current = renderer
    controlsRef.current = controls
    modelGroupRef.current = modelGroup
    overlayGroupRef.current = overlayGroup
    gridRef.current = grid
    sceneRef.current = scene
    appliedThemeRef.current = themeRef.current
    meshIndexRef.current = 0
    meshById.current.clear()

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

    const setEmissive = (id: number | null, hex: number, intensity: number) => {
      if (id == null) return
      for (const mesh of meshById.current.get(id) ?? []) {
        const material = mesh.material as THREE.MeshLambertMaterial
        material.emissive.setHex(hex)
        material.emissiveIntensity = intensity
      }
      requestRender()
    }

    const raycaster = new THREE.Raycaster()
    raycaster.layers.enableAll()
    const pointer = new THREE.Vector2()
    const pickAt = (clientX: number, clientY: number): number | null => {
      const rect = canvas.getBoundingClientRect()
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(pointer, camera)
      const groups =
        overlayGroup.children.length > 0
          ? [overlayGroup.children, modelGroup.children]
          : [modelGroup.children]
      const isolated = isolatedRef.current
      const hidden = hiddenRef.current
      const ghost = ghostRef.current
      const viewIsolate = viewIsolateRef.current
      for (const pickFrom of groups) {
        const hits = raycaster.intersectObjects(pickFrom, false)
        const hit = hits.find((item) => {
          const id = item.object.userData.expressId as number | undefined
          if (id == null) return false
          if (hidden.has(id) || ghost.has(id)) return false
          if (viewIsolate && !viewIsolate.has(id)) return false
          if (isolated && !isolated.has(id)) return false
          return true
        })
        if (!hit) continue
        const expressId = hit.object.userData.expressId as number | undefined
        return expressId ?? null
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
      const now = performance.now()
      if (now - lastHoverAt < 80) return
      lastHoverAt = now
      const cx = event.clientX
      const cy = event.clientY
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = 0
        const id = pickAt(cx, cy)
        canvas.classList.toggle('hovering', id != null)
        if (id === hoveredRef.current) return
        if (hoveredRef.current != null && !selectedIdsRef.current.has(hoveredRef.current)) {
          setEmissive(hoveredRef.current, 0x000000, 0)
        }
        hoveredRef.current = id
        if (id != null && !selectedIdsRef.current.has(id)) {
          setEmissive(id, 0x007acc, 0.28)
        }
        onHoverRef.current?.(id)
      })
    }

    const onPointerUp = () => {
      canvas.classList.remove('dragging')
    }

    const onPointerLeave = () => {
      canvas.classList.remove('dragging', 'hovering')
      if (hoveredRef.current != null && !selectedIdsRef.current.has(hoveredRef.current)) {
        setEmissive(hoveredRef.current, 0x000000, 0)
      }
      hoveredRef.current = null
      onHoverRef.current?.(null)
    }

    const onClick = (event: MouseEvent) => {
      if (didDrag) return
      onSelectRef.current(pickAt(event.clientX, event.clientY), isAdditiveModifier(event))
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
      renderer.dispose()
      scene.clear()
      meshIndexRef.current = 0
      meshById.current.clear()
      overlayGroupRef.current = null
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
    const group = modelGroupRef.current
    if (!group) return

    if (meshes.length === 0) {
      while (group.children.length) {
        const child = group.children.pop()
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          const material = child.material
          if (Array.isArray(material)) material.forEach((item) => item.dispose())
          else material.dispose()
        }
      }
      meshIndexRef.current = 0
      meshById.current.clear()
      requestRenderRef.current()
      return
    }

    if (group.children.length === 0) meshIndexRef.current = 0

    for (let i = meshIndexRef.current; i < meshes.length; i += 1) {
      const threeMesh = meshDataToThree(meshes[i])
      const material = threeMesh.material as THREE.MeshLambertMaterial
      threeMesh.userData.baseOpacity = material.opacity
      threeMesh.userData.baseTransparent = material.transparent
      threeMesh.userData.baseDepthWrite = material.depthWrite
      threeMesh.userData.baseColor = material.color.clone()
      group.add(threeMesh)
      const id = meshes[i].expressId
      const list = meshById.current.get(id) ?? []
      list.push(threeMesh)
      meshById.current.set(id, list)
    }
    meshIndexRef.current = meshes.length
    requestRenderRef.current()
  }, [meshes])

  useEffect(() => {
    isolatedRef.current = isolatedIds
    hiddenRef.current = hiddenIds
    ghostRef.current = ghostIds
    viewIsolateRef.current = viewIsolateIds
    for (const meshesForId of meshById.current.values()) {
      for (const mesh of meshesForId) {
        const material = mesh.material as THREE.MeshLambertMaterial
        const id = mesh.userData.expressId as number
        const overlayOn = overlayFaces != null && overlayFaces.length > 0 && selectedIds.has(id)
        const hidden = hiddenIds.has(id) || (viewIsolateIds != null && !viewIsolateIds.has(id))
        const ghost = !hidden && (ghostIds.has(id) || overlayOn)
        const dim = !hidden && !ghost && isolatedIds != null && !isolatedIds.has(id)
        const fade = ghost || dim
        const override = colorOverrides?.get(id)
        const visKey = `${hidden ? 1 : 0}${ghost ? 1 : 0}${dim ? 1 : 0}${override ? override.join() : ''}`
        if (mesh.userData.visKey === visKey) continue
        mesh.userData.visKey = visKey
        mesh.visible = !hidden
        if (override) material.color.setRGB(override[0], override[1], override[2])
        else if (mesh.userData.baseColor) material.color.copy(mesh.userData.baseColor)
        material.opacity = fade ? 0.12 : override ? override[3] : (mesh.userData.baseOpacity as number | undefined) ?? 1
        material.transparent = fade || Boolean(mesh.userData.baseTransparent) || Boolean(override && override[3] < 0.99)
        material.depthWrite = fade ? false : Boolean(mesh.userData.baseDepthWrite ?? true)
        material.needsUpdate = true
      }
    }
    requestRenderRef.current()
  }, [isolatedIds, hiddenIds, ghostIds, viewIsolateIds, meshes.length, overlayFaces, selectedIds, colorOverrides])

  useEffect(() => {
    const previous = selectedIdsRef.current
    for (const id of previous) {
      if (selectedIds.has(id)) continue
      for (const mesh of meshById.current.get(id) ?? []) {
        const material = mesh.material as THREE.MeshLambertMaterial
        material.emissive.setHex(0x000000)
      }
    }
    if (!(overlayFaces && overlayFaces.length > 0)) {
      for (const id of selectedIds) {
        for (const mesh of meshById.current.get(id) ?? []) {
          const material = mesh.material as THREE.MeshLambertMaterial
          material.emissive.setHex(0x007acc)
          material.emissiveIntensity = 0.45
        }
      }
    }
    selectedIdsRef.current = selectedIds
    requestRenderRef.current()
  }, [selectedIds, overlayFaces])

  useEffect(() => {
    const group = overlayGroupRef.current
    if (!group) return
    clearObject3d(group)
    if (overlayFaces && overlayFaces.length > 0) {
      for (const face of overlayFaces) addQuantityFaceOverlay(group, face, faceLayers)
    }
    requestRenderRef.current()
    return () => {
      clearObject3d(group)
    }
  }, [overlayFaces, selectedIds, faceLayers])

  useEffect(() => {
    const group = modelGroupRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    const grid = gridRef.current
    if (!group || !camera || !controls || group.children.length === 0) return
    const fitted = applyCameraFit(camera, controls, group)
    if (!fitted || !grid) return
    const box = new THREE.Box3().setFromObject(group)
    grid.position.y = box.min.y
    const scale = Math.max(fitted.maxDim * 2, 8) / 60
    grid.scale.setScalar(scale)
    requestRenderRef.current()
  }, [fitToken, meshes.length])

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

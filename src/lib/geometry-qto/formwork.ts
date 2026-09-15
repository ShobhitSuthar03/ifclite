import { extractFaces, isBuildingElementType, isColumnType } from '@/lib/geometry-qto/faces'
import { overlapMap } from '@/lib/geometry-qto/overlap'
import type {
  AreaMetrics,
  ElementQuantity,
  FaceQuantity,
  FormworkOptions,
  PlanarFace,
  QuantityResult,
  QtoMesh,
} from '@/lib/geometry-qto/types'
import { DEFAULT_CONTACT_GAP, DEFAULT_HORIZONTAL_DOT, VIEWER_UP } from '@/lib/geometry-qto/types'

function flattenTriangles(triangles: PlanarFace['triangles']): number[] {
  const positions: number[] = []
  for (const [a, b, c] of triangles) {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  }
  return positions
}

function toQuantity(
  face: PlanarFace,
  overlapArea: number,
  overlappingIds: number[],
  keepPositions: boolean,
): FaceQuantity {
  const gross = face.area
  const overlap = Math.min(overlapArea, gross)
  return {
    faceId: face.faceId,
    expressId: face.expressId,
    ifcType: face.ifcType,
    kind: face.kind,
    normal: [face.normal.x, face.normal.y, face.normal.z],
    grossArea: gross,
    overlapArea: overlap,
    netArea: Math.max(0, gross - overlap),
    overlappingIds,
    positions: keepPositions ? flattenTriangles(face.triangles) : [],
  }
}

function envelopeProjections(faces: PlanarFace[]): { x: number; y: number; z: number } {
  let x = 0
  let y = 0
  let z = 0
  for (const face of faces) {
    x += face.area * Math.abs(face.normal.x)
    y += face.area * Math.abs(face.normal.y)
    z += face.area * Math.abs(face.normal.z)
  }
  return { x: x * 0.5, y: y * 0.5, z: z * 0.5 }
}

function aabbOf(faces: PlanarFace[]) {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (const face of faces) {
    minX = Math.min(minX, face.aabb.min.x)
    minY = Math.min(minY, face.aabb.min.y)
    minZ = Math.min(minZ, face.aabb.min.z)
    maxX = Math.max(maxX, face.aabb.max.x)
    maxY = Math.max(maxY, face.aabb.max.y)
    maxZ = Math.max(maxZ, face.aabb.max.z)
  }
  return { dx: Math.max(0, maxX - minX), dy: Math.max(0, maxY - minY), dz: Math.max(0, maxZ - minZ) }
}

function enclosedVolume(faces: PlanarFace[]): number {
  let acc = 0
  for (const face of faces) {
    for (const [a, b, c] of face.triangles) {
      acc +=
        a.x * (b.y * c.z - b.z * c.y) +
        a.y * (b.z * c.x - b.x * c.z) +
        a.z * (b.x * c.y - b.y * c.x)
    }
  }
  return Math.abs(acc) / 6
}

function metricsFromFaces(faces: PlanarFace[], quantities: FaceQuantity[]): AreaMetrics {
  const proj = envelopeProjections(faces)
  const extents = aabbOf(faces)
  const axes: Array<{ size: number; area: number }> = [
    { size: extents.dx, area: proj.x },
    { size: extents.dy, area: proj.y },
    { size: extents.dz, area: proj.z },
  ]
  const longest = axes.reduce((best, item) => (item.size > best.size ? item : best), axes[0])
  let lateral = 0
  let under = 0
  let top = 0
  let gross = 0
  let covered = 0
  for (const face of quantities) {
    gross += face.grossArea
    covered += face.overlapArea
    if (face.kind === 'lateral') lateral += face.grossArea
    else if (face.kind === 'bottom') under += face.grossArea
    else top += face.grossArea
  }
  const envelope = [proj.x, proj.y, proj.z]
  const horiz = [extents.dx, extents.dz].sort((left, right) => right - left)
  return {
    AREAMAX: Math.max(...envelope),
    AREAMIN: Math.min(...envelope),
    LATERALAREA: lateral,
    UNDERAREA: under,
    TOPAREA: top,
    GROSSAREA: gross,
    COVEREDAREA: covered,
    UNCOVEREDAREA: Math.max(0, gross - covered),
    CROSSAREA: longest.area,
    FOOTPRINTAREA: proj.y,
    VOLUME: enclosedVolume(faces),
    LENGTH: horiz[0] ?? 0,
    WIDTH: horiz[1] ?? 0,
    HEIGHT: extents.dy,
    COUNT: 1,
  }
}

function addTotals(totals: QuantityResult['totals'], element: ElementQuantity) {
  totals.LATERALAREA += element.metrics.LATERALAREA
  totals.UNDERAREA += element.metrics.UNDERAREA
  totals.TOPAREA += element.metrics.TOPAREA
  totals.GROSSAREA += element.metrics.GROSSAREA
  totals.COVEREDAREA += element.metrics.COVEREDAREA
  totals.UNCOVEREDAREA += element.metrics.UNCOVEREDAREA
  totals.VOLUME += element.metrics.VOLUME
  totals.LENGTH += element.metrics.LENGTH
  totals.WIDTH += element.metrics.WIDTH
  totals.HEIGHT += element.metrics.HEIGHT
  totals.COUNT += element.metrics.COUNT
}

function emptyTotals(): QuantityResult['totals'] {
  return {
    LATERALAREA: 0,
    UNDERAREA: 0,
    TOPAREA: 0,
    GROSSAREA: 0,
    COVEREDAREA: 0,
    UNCOVEREDAREA: 0,
    VOLUME: 0,
    LENGTH: 0,
    WIDTH: 0,
    HEIGHT: 0,
    COUNT: 0,
  }
}

export function computeElementQuantities(meshes: QtoMesh[], options?: FormworkOptions): QuantityResult {
  const contactGap = options?.contactGap ?? DEFAULT_CONTACT_GAP
  const targetIds = options?.targetIds
  const keepPositionsFor = options?.keepPositionsFor
  const allFaces = extractFaces(meshes, {
    up: options?.up ?? VIEWER_UP,
    horizontalDot: options?.horizontalDot ?? DEFAULT_HORIZONTAL_DOT,
  })
  const overlaps = overlapMap(allFaces, contactGap)
  const grouped = new Map<number, PlanarFace[]>()
  for (const face of allFaces) {
    if (!isBuildingElementType(face.ifcType)) continue
    if (targetIds && !targetIds.has(face.expressId)) continue
    const list = grouped.get(face.expressId) ?? []
    list.push(face)
    grouped.set(face.expressId, list)
  }

  const elements: ElementQuantity[] = [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([expressId, faces]) => {
      const keepPositions = keepPositionsFor ? keepPositionsFor.has(expressId) : !targetIds
      const quantities = faces.map((face) => {
        const hit = overlaps.get(face.faceId) ?? { overlapArea: 0, overlappingIds: [] }
        return toQuantity(face, hit.overlapArea, hit.overlappingIds, keepPositions)
      })
      const metrics = metricsFromFaces(faces, quantities)
      return {
        expressId,
        ifcType: faces[0]?.ifcType || 'IfcBuildingElement',
        faces: quantities,
        metrics,
        grossArea: metrics.GROSSAREA,
        overlapArea: metrics.COVEREDAREA,
        netArea: metrics.UNCOVEREDAREA,
      }
    })

  const totals = emptyTotals()
  for (const element of elements) addTotals(totals, element)

  return {
    elements,
    elementCount: elements.length,
    columnCount: elements.filter((item) => isColumnType(item.ifcType)).length,
    totals,
    grossArea: totals.GROSSAREA,
    overlapArea: totals.COVEREDAREA,
    netArea: totals.UNCOVEREDAREA,
  }
}

/** Lateral-only column takeoff (subset of building-element quantities). */
export function computeColumnFormwork(meshes: QtoMesh[], options?: FormworkOptions): QuantityResult {
  const full = computeElementQuantities(meshes, options)
  const elements = full.elements
    .filter((item) => isColumnType(item.ifcType))
    .map((item) => {
      const faces = item.faces.filter((face) => face.kind === 'lateral')
      const grossArea = faces.reduce((sum, face) => sum + face.grossArea, 0)
      const overlapArea = faces.reduce((sum, face) => sum + face.overlapArea, 0)
      const netArea = faces.reduce((sum, face) => sum + face.netArea, 0)
      return {
        ...item,
        faces,
        grossArea,
        overlapArea,
        netArea,
        metrics: {
          ...item.metrics,
          GROSSAREA: grossArea,
          COVEREDAREA: overlapArea,
          UNCOVEREDAREA: netArea,
          LATERALAREA: grossArea,
        },
      }
    })
  const totals = emptyTotals()
  for (const element of elements) {
    totals.LATERALAREA += element.metrics.LATERALAREA
    totals.GROSSAREA += element.grossArea
    totals.COVEREDAREA += element.overlapArea
    totals.UNCOVEREDAREA += element.netArea
  }
  return {
    elements,
    elementCount: elements.length,
    columnCount: elements.length,
    totals,
    grossArea: totals.GROSSAREA,
    overlapArea: totals.COVEREDAREA,
    netArea: totals.UNCOVEREDAREA,
  }
}

export function filterQuantities(result: QuantityResult, keepIds: Set<number> | null): QuantityResult {
  if (!keepIds) return result
  const elements = result.elements.filter((item) => keepIds.has(item.expressId))
  const totals = emptyTotals()
  for (const element of elements) addTotals(totals, element)
  return {
    elements,
    elementCount: elements.length,
    columnCount: elements.filter((item) => isColumnType(item.ifcType)).length,
    totals,
    grossArea: totals.GROSSAREA,
    overlapArea: totals.COVEREDAREA,
    netArea: totals.UNCOVEREDAREA,
  }
}

export const filterFormwork = filterQuantities

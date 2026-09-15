export type QtoMesh = {
  expressId: number
  ifcType?: string
  positions: ArrayLike<number>
  indices: ArrayLike<number>
  origin?: [number, number, number] | number[]
}

export type Vec3 = { x: number; y: number; z: number }
export type Vec2 = { x: number; y: number }

export type Aabb = {
  min: Vec3
  max: Vec3
}

export type FaceKind = 'lateral' | 'top' | 'bottom'

export type PlanarFace = {
  faceId: string
  expressId: number
  ifcType: string
  kind: FaceKind
  normal: Vec3
  d: number
  area: number
  aabb: Aabb
  triangles: [Vec3, Vec3, Vec3][]
}

export type AreaMetrics = {
  AREAMAX: number
  AREAMIN: number
  LATERALAREA: number
  UNDERAREA: number
  TOPAREA: number
  GROSSAREA: number
  COVEREDAREA: number
  UNCOVEREDAREA: number
  CROSSAREA: number
  FOOTPRINTAREA: number
  VOLUME: number
  LENGTH: number
  WIDTH: number
  HEIGHT: number
  COUNT: number
}

export const AREA_FIELDS: Array<{
  key: keyof AreaMetrics
  aliases?: string[]
  label: string
  hint: string
}> = [
  {
    key: 'AREAMAX',
    label: 'AREAMAX',
    hint: 'Largest orthogonal envelope projection (silhouette along X, Y, or Z).',
  },
  {
    key: 'AREAMIN',
    label: 'AREAMIN',
    hint: 'Smallest orthogonal envelope projection of the element.',
  },
  {
    key: 'LATERALAREA',
    label: 'LATERALAREA',
    hint: 'Vertical / side faces, excluding top and soffit. Wall and column formwork.',
  },
  {
    key: 'UNDERAREA',
    label: 'UNDERAREA',
    hint: 'Downward-facing horizontal or inclined area (soffits, slab bottoms).',
  },
  {
    key: 'TOPAREA',
    label: 'TOPAREA',
    hint: 'Upward-facing horizontal or inclined area (slab tops, beam tops).',
  },
  {
    key: 'UNCOVEREDAREA',
    aliases: ['NETAREA'],
    label: 'UNCOVEREDAREA / NETAREA',
    hint: 'Exposed area after subtracting contact with adjacent elements.',
  },
  {
    key: 'COVEREDAREA',
    aliases: ['CONTACTAREA'],
    label: 'COVEREDAREA / CONTACTAREA',
    hint: 'Face area shared with an opposite neighbor (elements pressing together). Flush same-facing faces, such as a slab edge aligned with a wall elevation, are not covered.',
  },
  {
    key: 'CROSSAREA',
    aliases: ['SECTIONAREA'],
    label: 'CROSSAREA / SECTIONAREA',
    hint: 'Envelope projection perpendicular to the longest (extrusion) axis.',
  },
  {
    key: 'GROSSAREA',
    label: 'GROSSAREA',
    hint: 'Unclipped total surface area of all boundary faces.',
  },
  {
    key: 'FOOTPRINTAREA',
    label: 'FOOTPRINTAREA',
    hint: 'Horizontal projection on the ground plane (viewer XZ).',
  },
]

export const STANDARD_FIELDS: Array<{
  key: keyof AreaMetrics
  label: string
  hint: string
  unit: string
}> = [
  { key: 'COUNT', label: 'Count', hint: 'Number of elements in this takeoff.', unit: '' },
  { key: 'VOLUME', label: 'Volume', hint: 'Enclosed mesh volume (absolute tetrahedral sum).', unit: 'm³' },
  { key: 'LENGTH', label: 'Length', hint: 'Largest horizontal AABB extent.', unit: 'm' },
  { key: 'WIDTH', label: 'Width', hint: 'Smaller horizontal AABB extent.', unit: 'm' },
  { key: 'HEIGHT', label: 'Height', hint: 'Vertical AABB extent (viewer Y-up).', unit: 'm' },
]

export type FaceQuantity = {
  faceId: string
  expressId: number
  ifcType: string
  kind: FaceKind
  normal: [number, number, number]
  grossArea: number
  overlapArea: number
  netArea: number
  overlappingIds: number[]
  /** Flattened world-space triangle vertices for viewport overlay. */
  positions: number[]
}

export type ElementQuantity = {
  expressId: number
  ifcType: string
  faces: FaceQuantity[]
  metrics: AreaMetrics
  /** @deprecated use metrics.GROSSAREA */
  grossArea: number
  /** @deprecated use metrics.COVEREDAREA */
  overlapArea: number
  /** @deprecated use metrics.UNCOVEREDAREA */
  netArea: number
}

export type ElementFormwork = ElementQuantity

export type QuantityResult = {
  elements: ElementQuantity[]
  elementCount: number
  columnCount: number
  totals: Pick<
    AreaMetrics,
    | 'LATERALAREA'
    | 'UNDERAREA'
    | 'TOPAREA'
    | 'GROSSAREA'
    | 'COVEREDAREA'
    | 'UNCOVEREDAREA'
    | 'VOLUME'
    | 'LENGTH'
    | 'WIDTH'
    | 'HEIGHT'
    | 'COUNT'
  >
  grossArea: number
  overlapArea: number
  netArea: number
}

export type FormworkResult = QuantityResult

export type FormworkOptions = {
  /** Max gap along the face normal still treated as contact (metres). */
  contactGap?: number
  /**
   * |n·up| above this classifies a face as top/under (inclined included).
   * Remaining faces are lateral (vertical sides).
   */
  horizontalDot?: number
  up?: Vec3
  /** Only emit these elements; other meshes are used for contact only. */
  targetIds?: Set<number>
  /** Copy triangle vertices for overlay (selected ids). */
  keepPositionsFor?: Set<number>
}

export const DEFAULT_CONTACT_GAP = 0.005
/** Faces with |n·up| greater than this are top/under, including typical slopes. */
export const DEFAULT_HORIZONTAL_DOT = 0.15
export const VIEWER_UP: Vec3 = { x: 0, y: 1, z: 0 }

export const FACE_KIND_COLOR: Record<FaceKind, number> = {
  lateral: 0x2aa198,
  top: 0xcb4b16,
  bottom: 0x6c71c4,
}

export const CONTACT_FACE_COLOR = 0xdc322f

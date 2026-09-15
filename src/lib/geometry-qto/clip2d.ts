import type { Vec2, Vec3 } from '@/lib/geometry-qto/types'
import { ensureCcw, planeBasis, polygonArea2d, to2d } from '@/lib/geometry-qto/vec'

const CLIP_EPS = 1e-12

function isInside(p: Vec2, a: Vec2, b: Vec2): boolean {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= -CLIP_EPS
}

function lineIntersect(p1: Vec2, p2: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const ex = b.x - a.x
  const ey = b.y - a.y
  const denom = dx * ey - dy * ex
  if (Math.abs(denom) < CLIP_EPS) return { x: p2.x, y: p2.y }
  const t = ((a.x - p1.x) * ey - (a.y - p1.y) * ex) / denom
  return { x: p1.x + t * dx, y: p1.y + t * dy }
}

/** Clip subject polygon to the inside of a convex CCW clip polygon. */
export function sutherlandHodgman(subject: Vec2[], clip: Vec2[]): Vec2[] {
  if (subject.length < 3 || clip.length < 3) return []
  let output = subject
  for (let i = 0; i < clip.length; i += 1) {
    const a = clip[i]
    const b = clip[(i + 1) % clip.length]
    const input = output
    output = []
    if (input.length === 0) break
    let prev = input[input.length - 1]
    for (const curr of input) {
      const currIn = isInside(curr, a, b)
      const prevIn = isInside(prev, a, b)
      if (currIn) {
        if (!prevIn) output.push(lineIntersect(prev, curr, a, b))
        output.push(curr)
      } else if (prevIn) {
        output.push(lineIntersect(prev, curr, a, b))
      }
      prev = curr
    }
  }
  return output
}

export function triangleIntersectionArea(a: Vec2[], b: Vec2[]): number {
  const clip = sutherlandHodgman(ensureCcw(a), ensureCcw(b))
  if (clip.length < 3) return 0
  return Math.abs(polygonArea2d(clip))
}

export function trianglesOverlapArea(
  faceNormal: Vec3,
  origin: Vec3,
  ours: [Vec3, Vec3, Vec3][],
  theirs: [Vec3, Vec3, Vec3][],
): number {
  const { u, v } = planeBasis(faceNormal)
  const a2 = ours.map((tri) => tri.map((p) => to2d(p, origin, u, v)) as Vec2[])
  const b2 = theirs.map((tri) => tri.map((p) => to2d(p, origin, u, v)) as Vec2[])
  let area = 0
  for (const ta of a2) {
    for (const tb of b2) {
      area += triangleIntersectionArea(ta, tb)
    }
  }
  return area
}

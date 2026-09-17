const ACTIVITY_RGB: Record<string, [number, number, number]> = {
  Walls: [0.93, 0.48, 0.16],
  Beams: [0.2, 0.52, 0.92],
  Columns: [0.86, 0.22, 0.28],
  Slabs: [0.38, 0.72, 0.32],
  Stairs: [0.62, 0.36, 0.88],
  Predals: [0.12, 0.7, 0.72],
  Formwork: [0.95, 0.78, 0.18],
  Foundations: [0.58, 0.42, 0.28],
}

const ACTIVITY_MATCH: Array<[RegExp, string]> = [
  [/wall|wand/i, 'Walls'],
  [/beam|balk/i, 'Beams'],
  [/column|kolom/i, 'Columns'],
  [/slab|vloerplaat/i, 'Slabs'],
  [/stair|trap/i, 'Stairs'],
  [/predal/i, 'Predals'],
  [/formwork|bekisting/i, 'Formwork'],
  [/foundat|fundering/i, 'Foundations'],
]

export function namedActivity(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  for (const [pattern, label] of ACTIVITY_MATCH) {
    if (pattern.test(trimmed)) return label
  }
  return null
}

export function activityRgb(activity: string): [number, number, number] {
  const known = ACTIVITY_RGB[activity]
  if (known) return known
  let hash = 2166136261
  for (let i = 0; i < activity.length; i += 1) {
    hash ^= activity.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const hue = (hash >>> 0) % 360
  const sat = 0.58
  const light = 0.48
  const f = (n: number) => {
    const k = (n + hue / 30) % 12
    const a = sat * Math.min(light, 1 - light)
    return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [f(0), f(8), f(4)]
}

export function activityCss(activity: string): string {
  const [r, g, b] = activityRgb(activity)
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`
}

export function activityTint(
  activity: string,
  done: boolean,
): [number, number, number, number] {
  const [r, g, b] = activityRgb(activity)
  if (!done) return [r, g, b, 1]
  return [r * 0.78 + 0.12, g * 0.78 + 0.12, b * 0.78 + 0.12, 1]
}

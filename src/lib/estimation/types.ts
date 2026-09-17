import type { PropertyRef } from '@/lib/property-tree'
import type { QtyBinding } from '@/lib/estimation/qty-bind'

export type BoqKind = 'heading' | 'item'
export type BoqSource = 'property' | 'manual'

export type BoqNode = {
  id: string
  name: string
  kind: BoqKind
  source: BoqSource
  ids: number[]
  assemblyId: string | null
  children: BoqNode[]
}

export type BoqDoc = {
  id: string
  name: string
  groupBy: PropertyRef[]
  root: BoqNode[]
  qtyBindings: Record<string, QtyBinding>
  excludedLines: Record<string, boolean>
}

export type EstimationDoc = {
  activeId: string
  boqs: BoqDoc[]
}

export function newBoqId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `boq-${crypto.randomUUID()}`
  }
  return `boq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function emptyBoq(overrides: Partial<BoqDoc> = {}): BoqDoc {
  return {
    id: overrides.id ?? newBoqId(),
    name: overrides.name ?? 'BOQ 1',
    groupBy: overrides.groupBy ?? [],
    root: overrides.root ?? [],
    qtyBindings: overrides.qtyBindings ?? {},
    excludedLines: overrides.excludedLines ?? {},
  }
}

export function emptyEstimation(): EstimationDoc {
  const sheet = emptyBoq({ id: 'boq-1', name: 'BOQ 1' })
  return { activeId: sheet.id, boqs: [sheet] }
}

export function boqLabel(boq: BoqDoc): string {
  return boq.name.trim() || 'Untitled BOQ'
}

export function defaultBoqName(existing: BoqDoc[]): string {
  const used = new Set(existing.map((item) => boqLabel(item)))
  let index = existing.length + 1
  while (used.has(`BOQ ${index}`)) index += 1
  return `BOQ ${index}`
}

export function activeBoq(doc: EstimationDoc): BoqDoc {
  return doc.boqs.find((item) => item.id === doc.activeId) ?? doc.boqs[0] ?? emptyBoq({ id: 'boq-1', name: 'BOQ 1' })
}

export function mapActiveBoq(doc: EstimationDoc, updater: (boq: BoqDoc) => BoqDoc): EstimationDoc {
  const current = activeBoq(doc)
  const next = updater(current)
  const hasCurrent = doc.boqs.some((item) => item.id === current.id)
  return {
    activeId: next.id,
    boqs: hasCurrent ? doc.boqs.map((item) => (item.id === current.id ? next : item)) : [next],
  }
}

export function selectBoq(doc: EstimationDoc, id: string): EstimationDoc {
  if (!doc.boqs.some((item) => item.id === id)) return doc
  return { ...doc, activeId: id }
}

export function addBoq(doc: EstimationDoc, name?: string): EstimationDoc {
  const sheet = emptyBoq({ name: name?.trim() || defaultBoqName(doc.boqs) })
  return { activeId: sheet.id, boqs: [...doc.boqs, sheet] }
}

export function removeBoq(doc: EstimationDoc, id: string): EstimationDoc {
  const current = doc.boqs.find((item) => item.id === id)
  if (!current) return doc
  if (doc.boqs.length <= 1) {
    return {
      activeId: current.id,
      boqs: [emptyBoq({ id: current.id, name: current.name || 'BOQ 1' })],
    }
  }
  const index = doc.boqs.findIndex((item) => item.id === id)
  const boqs = doc.boqs.filter((item) => item.id !== id)
  const fallback = boqs[Math.max(0, index - 1)] ?? boqs[0]
  return { activeId: doc.activeId === id ? fallback.id : doc.activeId, boqs }
}

export function clearEstimationBoq(doc: EstimationDoc): EstimationDoc {
  return mapActiveBoq(doc, (boq) => ({ ...boq, root: [], qtyBindings: {}, excludedLines: {} }))
}

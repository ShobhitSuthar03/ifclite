import { describe, expect, it } from 'vitest'
import { FederationRegistry } from '@/lib/federation'

describe('FederationRegistry', () => {
  it('gives the first model offset 0, so a single-model session is a no-op', () => {
    const registry = new FederationRegistry()
    const model = registry.registerModel('a', 'a.ifc', 3000)
    expect(model.idOffset).toBe(0)
    expect(registry.toGlobalId('a', 42)).toBe(42)
  })

  it('assigns the next model a non-overlapping, rounded offset', () => {
    const registry = new FederationRegistry()
    registry.registerModel('a', 'a.ifc', 3000)
    const b = registry.registerModel('b', 'b.ifc', 4000)
    expect(b.idOffset).toBe(4000) // ceil(3001 / 1000) * 1000
    expect(registry.toGlobalId('b', 1)).toBe(4001)
    expect(registry.toGlobalId('a', 1)).toBe(1)
  })

  it('never collides even when both models reuse the same local expressIds', () => {
    const registry = new FederationRegistry()
    registry.registerModel('a', 'a.ifc', 100)
    registry.registerModel('b', 'b.ifc', 100)
    const globalA = registry.toGlobalId('a', 42)
    const globalB = registry.toGlobalId('b', 42)
    expect(globalA).not.toBe(globalB)
  })

  it('round-trips global ids back to their model and local expressId', () => {
    const registry = new FederationRegistry()
    registry.registerModel('a', 'a.ifc', 3000)
    registry.registerModel('b', 'b.ifc', 4000)
    registry.registerModel('c', 'c.ifc', 500)
    for (const [modelId, expressId] of [
      ['a', 1],
      ['a', 3000],
      ['b', 1],
      ['b', 4000],
      ['c', 250],
    ] as const) {
      const globalId = registry.toGlobalId(modelId, expressId)
      expect(registry.fromGlobalId(globalId)).toEqual({ modelId, expressId })
    }
  })

  it('returns null for a global id outside every registered range', () => {
    const registry = new FederationRegistry()
    registry.registerModel('a', 'a.ifc', 100)
    expect(registry.fromGlobalId(-1)).toBeNull()
    expect(registry.fromGlobalId(999999)).toBeNull()
  })

  it('rejects registering the same modelId twice', () => {
    const registry = new FederationRegistry()
    registry.registerModel('a', 'a.ifc', 100)
    expect(() => registry.registerModel('a', 'a-again.ifc', 50)).toThrow()
  })

  it('throws toGlobalId for a model that was never registered', () => {
    const registry = new FederationRegistry()
    expect(() => registry.toGlobalId('ghost', 1)).toThrow()
  })

  it('stops resolving a removed model but leaves other models intact', () => {
    const registry = new FederationRegistry()
    registry.registerModel('a', 'a.ifc', 100)
    const b = registry.registerModel('b', 'b.ifc', 100)
    registry.removeModel('a')
    expect(registry.getModel('a')).toBeUndefined()
    expect(registry.fromGlobalId(registry.toGlobalId('b', 1))).toEqual({ modelId: 'b', expressId: 1 })
    expect(registry.listModels()).toEqual([b])
  })

  it('ensureModel is idempotent: second call returns the same registration, widening maxExpressId', () => {
    const registry = new FederationRegistry()
    const first = registry.ensureModel('a', 'a.ifc', 100)
    const second = registry.ensureModel('a', 'a.ifc (rescan)', 250)
    expect(second).toBe(first) // same object, same already-assigned offset
    expect(second.idOffset).toBe(0)
    expect(second.maxExpressId).toBe(250)
    expect(registry.listModels()).toHaveLength(1)
  })

  it('tracks visibility, collapsed, and rename state per model', () => {
    const registry = new FederationRegistry()
    registry.registerModel('a', 'a.ifc', 100)
    registry.setVisible('a', false)
    registry.setCollapsed('a', true)
    registry.rename('a', 'Architecture')
    const model = registry.getModel('a')
    expect(model).toMatchObject({ name: 'Architecture', visible: false, collapsed: true })
  })
})

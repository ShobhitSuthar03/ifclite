import { describe, expect, it } from 'vitest'
import { parseCostAssemblyXml } from '@/lib/cost-assembly/parse'
import { emptyEstimation, activeBoq, mapActiveBoq } from '@/lib/estimation/types'
import { runEstimatorTool } from '@/lib/estimator-tools/handlers'
import { EstimatorRuntime } from '@/lib/estimator-tools/runtime'
import { classifySkip } from '@/lib/estimator-tools/skip'
import type { QuantityResult } from '@/lib/geometry-qto'

const SAMPLE = `<?xml version="1.0"?>
<AssemblyCatalogRoot>
  <PrjInfo>
    <NamePrj>PL-01</NamePrj>
    <DescrPrj>Pilot Sample</DescrPrj>
  </PrjInfo>
  <AssemblyCatalog>
    <CatalogName>BstnKat 1</CatalogName>
    <CatalogDescription>Baustein-Katalog  1</CatalogDescription>
    <CatalogType>Bausteine</CatalogType>
    <AssemblyDivision>
      <NameAssembly>26.21.</NameAssembly>
      <DescrAssembly><txt language="en">walls</txt></DescrAssembly>
      <Assembly>
        <NameAssembly>26.21.11.</NameAssembly>
        <DescrAssembly><txt language="en">cast-in-place walls/traditional formwork</txt></DescrAssembly>
        <AssemblyUoM>m3</AssemblyUoM>
        <EstDetails>
          <CoCDetail>
            <NameCoC>LO21.32.SYS.WAND</NameCoC>
            <DescrCoC><txt language="en">System formwork</txt></DescrCoC>
            <Quantity>1</Quantity>
            <Factor>0.85</Factor>
            <URValue>40.96</URValue>
            <CostFactor>1</CostFactor>
            <CFactorCoC>1</CFactorCoC>
            <QFactorCoC>1</QFactorCoC>
          </CoCDetail>
        </EstDetails>
      </Assembly>
    </AssemblyDivision>
  </AssemblyCatalog>
</AssemblyCatalogRoot>`

function emptyMetrics() {
  return {
    AREAMAX: 0,
    AREAMIN: 0,
    LATERALAREA: 0,
    UNDERAREA: 0,
    TOPAREA: 0,
    GROSSAREA: 0,
    COVEREDAREA: 0,
    UNCOVEREDAREA: 0,
    CROSSAREA: 0,
    FOOTPRINTAREA: 0,
    VOLUME: 0,
    LENGTH: 0,
    WIDTH: 0,
    HEIGHT: 0,
    COUNT: 1,
  }
}

function quantities(): QuantityResult {
  return {
    elements: [
      {
        expressId: 11,
        ifcType: 'IfcWall',
        faces: [],
        metrics: { ...emptyMetrics(), VOLUME: 2.5, LATERALAREA: 12, GROSSAREA: 14, COUNT: 1 },
        grossArea: 14,
        overlapArea: 0,
        netArea: 14,
      },
      {
        expressId: 99,
        ifcType: 'IfcOpeningElement',
        faces: [],
        metrics: { ...emptyMetrics(), VOLUME: 0 },
        grossArea: 0,
        overlapArea: 0,
        netArea: 0,
      },
    ],
    elementCount: 2,
    columnCount: 0,
    totals: {
      LATERALAREA: 12,
      UNDERAREA: 0,
      TOPAREA: 0,
      GROSSAREA: 14,
      COVEREDAREA: 0,
      UNCOVEREDAREA: 14,
      VOLUME: 2.5,
      LENGTH: 0,
      WIDTH: 0,
      HEIGHT: 0,
      COUNT: 2,
    },
    grossArea: 14,
    overlapArea: 0,
    netArea: 14,
  }
}

describe('skip_classify', () => {
  it('skips openings, spaces, zero volume, and temp names', () => {
    const decisions = classifySkip([
      { id: 1, ifcType: 'IfcOpeningElement' },
      { id: 2, ifcType: 'IfcSpace' },
      { id: 3, ifcType: 'IfcZone' },
      { id: 4, ifcType: 'IfcWall', volume: 0 },
      { id: 5, ifcType: 'IfcWall', name: 'Temporary scaffold' },
      { id: 6, ifcType: 'IfcWall', name: 'Core wall', volume: 3 },
    ])
    expect(decisions.filter((item) => item.skip).map((item) => item.id)).toEqual([1, 2, 3, 4, 5])
    expect(decisions.find((item) => item.id === 6)?.skip).toBe(false)
  })
})

describe('estimator tools', () => {
  function runtime() {
    const catalog = parseCostAssemblyXml(SAMPLE, { path: 'sample.xml', name: 'sample.xml' })
    const box = new EstimatorRuntime()
    box.setCatalog(catalog, catalog.sourcePath)
    box.quantities = quantities()
    box.estimation = mapActiveBoq(emptyEstimation(), (boq) => ({
      ...boq,
      root: [
        {
          id: 'p:wall',
          name: 'IfcWall',
          kind: 'item',
          source: 'property',
          ids: [11],
          assemblyId: null,
          children: [],
        },
      ],
    }))
    return box
  }

  it('searches and loads an assembly with L/M/P build-up', async () => {
    const box = runtime()
    const search = await runEstimatorTool('assembly_search', { query: 'formwork' }, box)
    expect(search.ok).toBe(true)
    const items = (search.data?.items as Array<{ id: string; code: string }>) ?? []
    expect(items[0]?.code).toBe('26.21.11.')
    const got = await runEstimatorTool('assembly_get', { assembly_id: items[0].id }, box)
    expect(got.ok).toBe(true)
    const rows = (got.data?.buildUp as Array<{ factor: number }>) ?? []
    expect(rows[0]?.factor).toBe(0.85)
  })

  it('classifies IfcWall / Concrete Wall onto the catalog', async () => {
    const box = runtime()
    const english = await runEstimatorTool('assembly_search', { query: 'Concrete Wall' }, box)
    expect(((english.data?.items as Array<{ code: string }>) ?? [])[0]?.code).toBe('26.21.11.')
    const classified = await runEstimatorTool('assembly_classify', { ifc_type: 'IfcWall', ids: [11] }, box)
    expect(((classified.data?.items as Array<{ code: string }>) ?? [])[0]?.code).toBe('26.21.11.')
  })

  it('assigns assemblies, takeoff qty, skip, and include ticks', async () => {
    const box = runtime()
    const search = await runEstimatorTool('assembly_search', { query: '26.21.11' }, box)
    const assemblyId = ((search.data?.items as Array<{ id: string }>) ?? [])[0]?.id
    expect(assemblyId).toBeTruthy()
    const assigned = await runEstimatorTool('estimation_assign_assembly', { node_id: 'p:wall', assembly_id: assemblyId }, box)
    expect(assigned.ok).toBe(true)
    expect(activeBoq(box.estimation).root[0].assemblyId).toBe(assemblyId)
    const qto = await runEstimatorTool('qto_for_ids', { ids: [11] }, box)
    const metrics = qto.data?.metrics as { VOLUME?: number } | undefined
    expect(metrics?.VOLUME).toBe(2.5)
    const skip = await runEstimatorTool('skip_classify', { ids: [11, 99] }, box)
    const decisions = (skip.data?.decisions as Array<{ id: number; skip: boolean }> | undefined) ?? []
    expect(decisions.find((item) => item.id === 99)?.skip).toBe(true)
    expect(decisions.find((item) => item.id === 11)?.skip).toBe(false)
    const bind = await runEstimatorTool(
      'estimation_set_qty_binding',
      { assembly_id: assemblyId, row_id: 'c0', mode: 'takeoff', field: 'LATERALAREA' },
      box,
    )
    expect(bind.ok).toBe(true)
    const include = await runEstimatorTool(
      'estimation_set_included',
      { assembly_id: assemblyId, row_id: 'c0', included: false },
      box,
    )
    expect(include.ok).toBe(true)
    expect(activeBoq(box.estimation).excludedLines[`${assemblyId}::c0`]).toBe(true)
  })

  it('computes missing takeoff through ensureQuantities', async () => {
    const box = runtime()
    box.quantities = null
    let asked: number[] = []
    box.ensureQuantities = async (ids) => {
      asked = ids
      box.quantities = quantities()
    }
    const qto = await runEstimatorTool('qto_for_ids', { ids: [11] }, box)
    expect(asked).toEqual([11])
    expect(qto.data?.computed).toBe(true)
    expect((qto.data?.metrics as { VOLUME?: number }).VOLUME).toBe(2.5)
  })

  it('keeps agent writes until the app acknowledges the revision', async () => {
    const box = runtime()
    box.applyFromApp({ revision: 1, estimation: box.estimation, force: true })
    const search = await runEstimatorTool('assembly_search', { query: '26.21.11' }, box)
    const assemblyId = ((search.data?.items as Array<{ id: string }>) ?? [])[0]?.id
    const assigned = await runEstimatorTool(
      'estimation_assign_assembly',
      { node_id: 'p:wall', assembly_id: assemblyId },
      box,
    )
    expect(assigned.ok).toBe(true)
    expect(box.origin).toBe('agent')
    const rejected = box.applyFromApp({
      revision: 1,
      estimation: emptyEstimation(),
    })
    expect(rejected.accepted).toBe(false)
    expect(activeBoq(box.estimation).root[0].assemblyId).toBe(assemblyId)
    const accepted = box.applyFromApp({
      revision: box.revision,
      estimation: emptyEstimation(),
      force: true,
    })
    expect(activeBoq(accepted.snapshot.estimation).root).toEqual([])
    expect(accepted.accepted).toBe(true)
    expect(activeBoq(box.estimation).root).toEqual([])
  })

  it('selects, isolates, and property-searches through viewer callbacks', async () => {
    const box = runtime()
    const viewer: Array<{ kind: string; ids?: number[] }> = []
    box.applyViewer = (action) => {
      viewer.push(action)
    }
    box.searchElements = async () => ({
      ids: [11],
      hits: [{ id: 11, ifcType: 'IfcWall', name: 'W1', storey: 'Level 1' }],
      truncated: false,
    })
    const selected = await runEstimatorTool('desktop_select', { ids: [11] }, box)
    expect(selected.ok).toBe(true)
    expect(box.selectedIds).toEqual([11])
    const isolated = await runEstimatorTool('desktop_isolate', { ids: [11] }, box)
    expect(isolated.ok).toBe(true)
    expect(viewer.some((action) => action.kind === 'isolate')).toBe(true)
    const search = await runEstimatorTool('property_search', { ifc_type: 'IfcWall', isolate: true }, box)
    expect(search.ok).toBe(true)
    expect(search.data?.ids).toEqual([11])
    const shown = await runEstimatorTool('desktop_show_all', {}, box)
    expect(shown.ok).toBe(true)
  })

  it('applies viewer ack without overwriting an in-flight agent BOQ', async () => {
    const box = runtime()
    box.applyFromApp({ revision: 1, estimation: box.estimation, force: true })
    await runEstimatorTool('desktop_select', { ids: [11] }, box)
    const search = await runEstimatorTool('assembly_search', { query: '26.21.11' }, box)
    const assemblyId = ((search.data?.items as Array<{ id: string }>) ?? [])[0]?.id
    await runEstimatorTool('estimation_assign_assembly', { node_id: 'p:wall', assembly_id: assemblyId }, box)
    expect(box.origin).toBe('agent')
    expect(box.pendingViewer.length).toBeGreaterThan(0)
    const ack = box.applyFromApp({
      revision: 1,
      consumedViewer: box.pendingViewer.length,
    })
    expect(ack.accepted).toBe(false)
    expect(box.origin).toBe('agent')
    expect(activeBoq(box.estimation).root[0].assemblyId).toBe(assemblyId)
    expect(box.pendingViewer).toEqual([])
  })

  it('seeds a sample BOQ with a catalog recipe and takeoff', async () => {
    const box = runtime()
    box.selectedIds = [11]
    box.mergeHints([{ id: 11, ifcType: 'IfcWall', name: 'Core wall' }])
    const seeded = await runEstimatorTool('estimation_seed_sample', {}, box)
    expect(seeded.ok).toBe(true)
    expect(activeBoq(box.estimation).root.length).toBeGreaterThan(0)
    expect(activeBoq(box.estimation).name).toBe('Sample BOQ')
    expect(activeBoq(box.estimation).root.some((node) => node.assemblyId)).toBe(true)
    const assigned = (seeded.data?.assigned as Array<{ code: string }>) ?? []
    expect(assigned[0]?.code).toBe('26.21.11.')
  })
})

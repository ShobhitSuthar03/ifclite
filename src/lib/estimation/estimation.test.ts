import { describe, expect, it } from 'vitest'
import type { PropertyTreeNode } from '@/lib/property-tree'
import type { BuildUpRow } from '@/lib/cost-assembly/build-up'
import { parseEstimation } from '@/lib/estimation/parse'
import { quantityForIds, uomMethod } from '@/lib/estimation/qty'
import { computedLineAmount, elementBuildUps, measureTakeoff, measuredLineQty, suggestQtyBinding } from '@/lib/estimation/qty-bind'
import { isLineExcluded, setLineIncluded } from '@/lib/estimation/include'
import {
  addChildNode,
  createManualHeading,
  createManualItem,
  rebuildBoq,
  setNodeAssembly,
} from '@/lib/estimation/tree'
import { applyImportedBoq, clearEstimationBoq, emptyEstimation, activeBoq, addBoq, removeBoq, selectBoq } from '@/lib/estimation/types'
import { parseBoqCsv } from '@/lib/estimation/import-csv'
import { parseBoqXml } from '@/lib/estimation/import-xml'
import { bindImportedBoq } from '@/lib/estimation/bind'
import type { QuantityResult } from '@/lib/geometry-qto'

const wall: PropertyTreeNode = {
  key: 'Level 1/IfcWall',
  label: 'IfcWall',
  count: 2,
  ids: [11, 12],
  children: [],
}

const storey: PropertyTreeNode = {
  key: 'Level 1',
  label: 'Level 1',
  count: 2,
  ids: [11, 12],
  children: [wall],
}

describe('estimation quantities', () => {
  it('maps assembly units onto takeoff metrics', () => {
    expect(uomMethod('m3')).toBe('volume')
    expect(uomMethod('m³')).toBe('volume')
    expect(uomMethod('m2')).toBe('area')
    expect(uomMethod('lm')).toBe('length')
    expect(uomMethod('st')).toBe('count')
  })

  it('sums volume for m3 assemblies and falls back to count without takeoff', () => {
    const quantities: QuantityResult = {
      elements: [
        emptyElement(11, 2.5, 10),
        emptyElement(12, 1.5, 8),
      ],
      elementCount: 2,
      columnCount: 0,
      totals: emptyTotals(),
      grossArea: 18,
      overlapArea: 0,
      netArea: 18,
    }
    expect(quantityForIds([11, 12], 'm3', quantities)).toEqual({ qty: 4, method: 'volume' })
    expect(quantityForIds([11, 12], 'm3', null)).toEqual({ qty: 2, method: 'count' })
  })
})

describe('estimation BOQ tree', () => {
  it('builds headings from nested properties and keeps assembly assignments on rebuild', () => {
    const first = rebuildBoq([storey], [])
    expect(first[0]?.kind).toBe('heading')
    expect(first[0]?.children[0]?.name).toBe('IfcWall')
    const assigned = setNodeAssembly(first, first[0].children[0].id, '26.21.11')
    const rebuilt = rebuildBoq([storey], assigned)
    expect(rebuilt[0]?.children[0]?.assemblyId).toBe('26.21.11')
  })

  it('keeps manual items when the property tree is rebuilt', () => {
    const item = createManualItem('Selection', [99])
    expect(item).not.toBeNull()
    const heading = createManualHeading('Extra')
    expect(heading).not.toBeNull()
    const withManual = addChildNode(rebuildBoq([storey], []), null, heading!)
    const nested = addChildNode(withManual, heading!.id, item!)
    const rebuilt = rebuildBoq([storey], nested)
    expect(rebuilt.some((node) => node.source === 'property')).toBe(true)
    expect(rebuilt.some((node) => node.source === 'manual' && node.name === 'Extra')).toBe(true)
  })
})

describe('estimation session', () => {
  it('parses a stored BOQ and ignores junk', () => {
    const parsed = parseEstimation({
      groupBy: [{ set: 'Attributes', name: 'Storey', kind: 'attribute' }],
      root: [
        {
          id: 'p:Level 1',
          name: 'Level 1',
          kind: 'heading',
          source: 'property',
          ids: [1, 2],
          assemblyId: 'a1',
          children: [
            {
              id: 'p:Level 1/IfcWall',
              name: 'IfcWall',
              kind: 'item',
              source: 'property',
              ids: [1],
              assemblyId: null,
              children: [],
            },
          ],
        },
      ],
    })
    const sheet = activeBoq(parsed)
    expect(sheet.groupBy).toEqual([{ set: 'Attributes', name: 'Storey', kind: 'attribute' }])
    expect(sheet.root[0]?.children[0]?.name).toBe('IfcWall')
    expect(sheet.name).toBe('')
    expect(sheet.qtyBindings).toEqual({})
    expect(sheet.excludedLines).toEqual({})
    expect(parseEstimation(undefined)).toEqual(emptyEstimation())
  })

  it('keeps a BOQ document name', () => {
    expect(activeBoq(parseEstimation({ name: '  Tower A  ', root: [] })).name).toBe('Tower A')
    expect(activeBoq(emptyEstimation()).name).toBe('BOQ 1')
  })

  it('clears the whole BOQ tree while keeping the name and grouping', () => {
    const doc = parseEstimation({
      name: 'Tower A',
      groupBy: [{ set: 'Attributes', name: 'Storey', kind: 'attribute' }],
      root: [{ id: 'p:Wall', name: 'Wall', kind: 'item', source: 'manual', ids: [1], assemblyId: 'a1', children: [] }],
      qtyBindings: { 'a1::c0': { mode: 'takeoff', field: 'VOLUME' } },
      excludedLines: { 'a1::c0': true },
    })
    const sheet = activeBoq(clearEstimationBoq(doc))
    expect(sheet.name).toBe('Tower A')
    expect(sheet.groupBy).toEqual([{ set: 'Attributes', name: 'Storey', kind: 'attribute' }])
    expect(sheet.root).toEqual([])
    expect(sheet.qtyBindings).toEqual({})
    expect(sheet.excludedLines).toEqual({})
  })

  it('keeps grouping independent on each BOQ sheet', () => {
    const first = parseEstimation({
      name: 'Structure',
      groupBy: [{ set: 'Attributes', name: 'Storey', kind: 'attribute' }],
      root: [{ id: 'p:Wall', name: 'Wall', kind: 'item', source: 'manual', ids: [1], assemblyId: null, children: [] }],
    })
    const withSecond = addBoq(first, 'Finishes')
    const storey = { set: 'Attributes', name: 'Storey', kind: 'attribute' as const }
    const ifcType = { set: 'Attributes', name: 'IFC Type', kind: 'attribute' as const }
    const grouped = {
      ...withSecond,
      boqs: withSecond.boqs.map((boq) =>
        boq.name === 'Finishes' ? { ...boq, groupBy: [ifcType] } : { ...boq, groupBy: [storey] },
      ),
    }
    expect(activeBoq(selectBoq(grouped, first.activeId)).groupBy).toEqual([storey])
    expect(activeBoq(selectBoq(grouped, withSecond.activeId)).groupBy).toEqual([ifcType])
    expect(grouped.boqs).toHaveLength(2)
    const removed = removeBoq(grouped, withSecond.activeId)
    expect(removed.boqs).toHaveLength(1)
    expect(activeBoq(removed).name).toBe('Structure')
  })

  it('keeps per-line quantity bindings', () => {
    const parsed = parseEstimation({
      groupBy: [],
      root: [],
      qtyBindings: {
        'a1::s0-c0': { mode: 'takeoff', field: 'LATERALAREA' },
        'a1::s0-c1': { mode: 'ifc', property: { set: 'Qto_BeamBaseQuantities', name: 'NetVolume', kind: 'quantity' } },
        junk: { mode: 'nope' },
      },
    })
    expect(activeBoq(parsed).qtyBindings['a1::s0-c0']).toEqual({ mode: 'takeoff', field: 'LATERALAREA' })
    expect(activeBoq(parsed).qtyBindings['a1::s0-c1']).toEqual({
      mode: 'ifc',
      property: { set: 'Qto_BeamBaseQuantities', name: 'NetVolume', kind: 'quantity' },
    })
    expect(activeBoq(parsed).qtyBindings.junk).toBeUndefined()
  })
})

describe('build-up quantity sources', () => {
  it('suggests lateral area for formwork and volume for concrete', () => {
    expect(suggestQtyBinding(leafRow({ description: 'Formwork beams, ring beam, lintel' }))).toEqual({
      mode: 'takeoff',
      field: 'LATERALAREA',
    })
    expect(suggestQtyBinding(leafRow({ description: 'Concrete in situ', unit: 'm3' }))).toEqual({
      mode: 'takeoff',
      field: 'VOLUME',
    })
    expect(suggestQtyBinding(leafRow({ description: 'Site labour', kind: 'labor' }))).toEqual({ mode: 'assembly' })
  })

  it('measures takeoff fields over selected elements and applies factor', () => {
    const quantities: QuantityResult = {
      elements: [emptyElement(11, 2.5, 10), emptyElement(12, 1.5, 8)],
      elementCount: 2,
      columnCount: 0,
      totals: emptyTotals(),
      grossArea: 18,
      overlapArea: 0,
      netArea: 18,
    }
    expect(measureTakeoff([11, 12], 'LATERALAREA', quantities)).toBe(18)
    expect(measureTakeoff([11, 12], 'VOLUME', quantities)).toBe(4)
    const formwork = leafRow({ description: 'Formwork', factor: 1.6, extraFactors: 1, rate: 40.96 })
    const qty = measuredLineQty(formwork, { mode: 'takeoff', field: 'LATERALAREA' }, {
      ids: [11, 12],
      assemblyQty: 16,
      quantities,
    })
    expect(qty).toEqual({ qty: 18, unit: 'm²' })
    expect(computedLineAmount(formwork, qty.qty)).toBeCloseTo(18 * 1.6 * 40.96)
  })

  it('splits formwork and cost onto each mapped element', () => {
    const quantities: QuantityResult = {
      elements: [emptyElement(11, 2.5, 10), emptyElement(12, 1.5, 8)],
      elementCount: 2,
      columnCount: 0,
      totals: emptyTotals(),
      grossArea: 18,
      overlapArea: 0,
      netArea: 18,
    }
    const formwork = leafRow({ id: 'c0', description: 'Formwork', factor: 1, extraFactors: 1, rate: 40 })
    const rows = elementBuildUps({
      rows: [formwork],
      ids: [11, 12],
      assemblyId: 'a1',
      assemblyUom: 'm2',
      bindings: { 'a1::c0': { mode: 'takeoff', field: 'LATERALAREA' } },
      excluded: {},
      quantities,
    })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ expressId: 11, formwork: 10, volume: 2.5, total: 400 })
    expect(rows[1]).toMatchObject({ expressId: 12, formwork: 8, volume: 1.5, total: 320 })
    expect(rows[0].total + rows[1].total).toBeCloseTo(18 * 40)
  })

  it('can exclude a cost line from the total', () => {
    const formwork = leafRow({ id: 'c0', description: 'Formwork', rate: 10, amount: 10 })
    const rebar = leafRow({ id: 'c1', parentId: 's0', description: 'Rebar', rate: 5, amount: 5 })
    const group = leafRow({
      id: 's0',
      hasChildren: true,
      kind: 'group',
      description: 'Rebar',
      rate: null,
      amount: 5,
    })
    const excludedLeaf = setLineIncluded({}, [formwork, rebar], 'a1', 'c0', false)
    expect(isLineExcluded(excludedLeaf, 'a1', 'c0')).toBe(true)
    expect(isLineExcluded(excludedLeaf, 'a1', 'c1')).toBe(false)
    const excludedGroup = setLineIncluded({}, [group, rebar], 'a1', 's0', false)
    expect(isLineExcluded(excludedGroup, 'a1', 'c1')).toBe(true)
    const parsed = parseEstimation({ excludedLines: { 'a1::c0': true } })
    expect(activeBoq(parsed).excludedLines['a1::c0']).toBe(true)
  })
})

describe('BOQ XML and CSV import', () => {
  const xml = `<?xml version="1.0"?>
<MainManager StructVersion="2.0" WrittenByProgram="iTWO V12.0" Type="InternalExport">
  <ElementItem>
    <ID>root</ID><Key>-</Key><Desc>Element Planning</Desc>
    <Childs>
      <ElementItem>
        <ID>arc</ID><Key>10</Key><Desc>ARC</Desc><Type><Undefined/></Type>
        <Childs>
          <ElementItem>
            <ID>doors</ID><Key>10.10</Key><Desc>Doors</Desc><MatchKey>40.11.40.</MatchKey>
            <Type>
              <CompositeLinkExt>
                <ItemData><Formula>QTO(Type:="NumberOfItems";UoM:="Pc")</Formula></ItemData>
              </CompositeLinkExt>
            </Type>
          </ElementItem>
        </Childs>
      </ElementItem>
      <ElementItem>
        <ID>str</ID><Key>20</Key><Desc>STR</Desc><Type><Undefined/></Type>
        <Childs>
          <ElementItem>
            <ID>floor</ID><Key>20.20</Key><Desc>Base Concrete Floor</Desc><MatchKey>15.21.</MatchKey>
            <Type>
              <CompositeLinkExt>
                <ItemData>
                  <Formula>QTO(Type:="Volume";UoM:="m3")</Formula>
                  <Formula ID="Bekistingsopp" Type="0">QTO(Type:="LateralArea";UoM:="m2")</Formula>
                </ItemData>
              </CompositeLinkExt>
            </Type>
          </ElementItem>
        </Childs>
      </ElementItem>
    </Childs>
  </ElementItem>
</MainManager>`

  it('parses iTWO Element Planning XML into headings and QTO items', () => {
    const result = parseBoqXml(new TextEncoder().encode(xml), 'BOQ TEST.xml', [
      { id: 'a-doors', code: '40.11.40.' },
      { id: 'a-floor', code: '15.21.11.' },
    ])
    expect(result.itemCount).toBe(2)
    expect(result.boq.root.map((node) => node.name)).toEqual(['ARC', 'STR'])
    expect(result.boq.root[0]?.kind).toBe('heading')
    const doors = result.boq.root[0]?.children[0]
    expect(doors?.name).toBe('Doors')
    expect(doors?.source).toBe('import')
    expect(doors?.code).toBe('10.10')
    expect(doors?.assemblyId).toBe('a-doors')
    expect(doors?.qtyTakeoff).toBe('COUNT')
    const floor = result.boq.root[1]?.children[0]
    expect(floor?.qtyTakeoff).toBe('VOLUME')
    expect(floor?.assemblyId).toBe('a-floor')
  })

  it('parses the CSV template including semicolon Excel exports', () => {
    const csv = [
      'kind;code;parent_code;name;assembly_code;qty_type;qty_uom',
      'heading;10;;ARC;;;',
      'item;10.10;10;Doors;40.11.40.;NumberOfItems;Pc',
    ].join('\n')
    const result = parseBoqCsv(new TextEncoder().encode(csv), 'boq.csv', [{ id: 'a-doors', code: '40.11.40.' }])
    expect(result.boq.root[0]?.name).toBe('ARC')
    expect(result.boq.root[0]?.children[0]?.name).toBe('Doors')
    expect(result.boq.root[0]?.children[0]?.assemblyId).toBe('a-doors')
    expect(result.matchedAssemblies).toBe(1)
  })

  it('keeps imported lines when the property BOQ is rebuilt', () => {
    const imported = parseBoqCsv(
      new TextEncoder().encode('kind,code,parent_code,name\nheading,10,,ARC\nitem,10.10,10,Doors\n'),
      'boq.csv',
    )
    const rebuilt = rebuildBoq([storey], imported.boq.root)
    expect(rebuilt.some((node) => node.source === 'property')).toBe(true)
    expect(rebuilt.some((node) => node.source === 'import' && node.name === 'ARC')).toBe(true)
  })

  it('fills an empty sheet and otherwise adds a new BOQ', () => {
    const imported = parseBoqCsv(
      new TextEncoder().encode('kind,code,name\nitem,10.10,Doors\n'),
      'Doors.csv',
    )
    const filled = applyImportedBoq(emptyEstimation(), imported.boq)
    expect(filled.boqs).toHaveLength(1)
    expect(activeBoq(filled).root[0]?.name).toBe('Doors')
    const second = applyImportedBoq(filled, { ...imported.boq, name: 'Second' })
    expect(second.boqs).toHaveLength(2)
    expect(activeBoq(second).name).toBe('Second')
  })

  it('maps imported lines onto IFC ids by property value / MatchKey', () => {
    const imported = parseBoqCsv(
      new TextEncoder().encode(
        [
          'kind,code,parent_code,name,assembly_code,match_property,match_value',
          'heading,10,,ARC,,,',
          'item,10.10,10,Doors,40.11.40.,ObjectType,40.11.40.',
          'item,10.20,10,Windows,40.11.20.,,40.11.20.',
        ].join('\n'),
      ),
      'boq.csv',
    )
    const doors = imported.boq.root[0]?.children[0]
    expect(doors?.matchValue).toBe('40.11.40.')
    expect(doors?.matchProperty?.name).toBe('ObjectType')
    const labels = new Map<number, string>([
      [11, '40.11.40.01'],
      [12, '40.11.20.'],
      [13, '15.21.'],
    ])
    const bound = bindImportedBoq(
      { ...imported.boq, linkProperty: { set: 'Attributes', name: 'ObjectType', kind: 'attribute' } },
      new Map([['attribute:Attributes.ObjectType', labels]]),
    )
    expect(bound.mappedLines).toBe(2)
    expect(bound.boq.root[0]?.children[0]?.ids).toEqual([11])
    expect(bound.boq.root[0]?.children[1]?.ids).toEqual([12])
    expect(bound.boq.root[0]?.ids).toEqual([11, 12])
  })
})

function emptyElement(expressId: number, volume: number, area: number) {
  return {
    expressId,
    ifcType: 'IfcWall',
    faces: [],
    metrics: {
      AREAMAX: area,
      AREAMIN: 0,
      LATERALAREA: area,
      UNDERAREA: 0,
      TOPAREA: 0,
      GROSSAREA: area,
      COVEREDAREA: 0,
      UNCOVEREDAREA: area,
      CROSSAREA: 0,
      FOOTPRINTAREA: 0,
      VOLUME: volume,
      LENGTH: 1,
      WIDTH: 1,
      HEIGHT: 1,
      FOOTPRINTPERIMETER: 4,
      GIRTH: 4,
      COUNT: 1,
    },
    grossArea: area,
    overlapArea: 0,
    netArea: area,
  }
}

function emptyTotals() {
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
    FOOTPRINTPERIMETER: 0,
    GIRTH: 0,
    COUNT: 0,
  }
}

function leafRow(overrides: Partial<BuildUpRow> = {}): BuildUpRow {
  return {
    id: 'c0',
    parentId: null,
    hasChildren: false,
    indent: 0,
    kind: 'material',
    code: 'MA',
    description: 'Item',
    qty: 1,
    unit: '',
    factor: 1,
    extraFactors: 1,
    rate: 10,
    amount: 10,
    muted: false,
    ...overrides,
  }
}

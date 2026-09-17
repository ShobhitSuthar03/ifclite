import { describe, expect, it } from 'vitest'
import { parseCostAssemblyXml } from '@/lib/cost-assembly/parse'
import { filterDivisionTree, matchesQuery } from '@/lib/cost-assembly/search'

const SAMPLE = `<?xml version="1.0"?>
<AssemblyCatalogRoot>
  <PrjInfo>
    <NamePrj>PL-01</NamePrj>
    <DescrPrj>Pilot Sample</DescrPrj>
    <CGRCatalog>
      <CGRCatalog0>Allowances</CGRCatalog0>
      <CGRCatalog1>CC</CGRCatalog1>
    </CGRCatalog>
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
          <SubItem>
            <SubitemNumber>A</SubitemNumber>
            <Quantity>1</Quantity>
            <Factor>1</Factor>
            <FactorIsPerformanceFactor>0</FactorIsPerformanceFactor>
            <CostFactor>1</CostFactor>
            <FlagFixedBudget>0</FlagFixedBudget>
            <BudgetUomItem>0</BudgetUomItem>
            <Budget>0</Budget>
            <Text><txt language="en">Formwork</txt></Text>
            <UnitOfMeasure>m2</UnitOfMeasure>
            <SItemNo>A</SItemNo>
            <SItemLSum>0</SItemLSum>
            <SItemLSumAbs>0</SItemLSumAbs>
            <SItemDisabled>0</SItemDisabled>
            <Compressed>0</Compressed>
            <SItemReserve>0</SItemReserve>
            <SPPhase>Tender</SPPhase>
            <EstimateStatus>not estimated</EstimateStatus>
            <EstDetails>
              <CoCDetail>
                <NameCoC>LO21.32.SYS.WAND</NameCoC>
                <DescrCoC><txt language="en">System formwork</txt></DescrCoC>
                <SItemDisabled>0</SItemDisabled>
                <CURCoC>EUR</CURCoC>
                <Quantity>1</Quantity>
                <Factor>0.85</Factor>
                <FactorIsPerformanceFactor>0</FactorIsPerformanceFactor>
                <URValue>40.96</URValue>
                <CostFactor>1</CostFactor>
                <CFactorCoC>1</CFactorCoC>
                <QFactorCoC>1</QFactorCoC>
                <FlagFixedBudget>0</FlagFixedBudget>
                <BudgetUomItem>0</BudgetUomItem>
                <Budget>0</Budget>
                <CatalogAssignments>
                  <CGR0Element>21.32.SYS.LO.TBEK.000</CGR0Element>
                  <CtlgAssign Name="CC"><CtlgCode>21.32.SYS.LO.TBEK.000</CtlgCode></CtlgAssign>
                </CatalogAssignments>
              </CoCDetail>
              <CoCDetail>
                <NameCoC>MA21.32.SYS.TBEK.WAND</NameCoC>
                <DescrCoC><txt language="en">Formwork material</txt></DescrCoC>
                <SItemDisabled>0</SItemDisabled>
                <CURCoC>EUR</CURCoC>
                <Quantity>1</Quantity>
                <Factor>1</Factor>
                <FactorIsPerformanceFactor>0</FactorIsPerformanceFactor>
                <URValue>0.63</URValue>
                <CostFactor>1</CostFactor>
                <CFactorCoC>1</CFactorCoC>
                <QFactorCoC>1</QFactorCoC>
                <FlagFixedBudget>0</FlagFixedBudget>
                <BudgetUomItem>0</BudgetUomItem>
                <Budget>0</Budget>
              </CoCDetail>
            </EstDetails>
          </SubItem>
        </EstDetails>
        <AssemblyCurrency>EUR</AssemblyCurrency>
        <IsAssembly>1</IsAssembly>
        <IsPlantOrEquipAssembly>0</IsPlantOrEquipAssembly>
        <IsDiffAssembly>0</IsDiffAssembly>
        <IsRefItemAssembly>0</IsRefItemAssembly>
        <LSumAssembly>0</LSumAssembly>
        <BreakUp>1</BreakUp>
        <Costs>35.446</Costs>
        <Hours>0.85</Hours>
        <Parameters>
          <Parameter>
            <CharacteristicObjectCode>Volume</CharacteristicObjectCode>
            <CharacteristicDescription>Volume | Volume</CharacteristicDescription>
            <CharacteristicUnit>m3</CharacteristicUnit>
            <CharacteristicType>Addable</CharacteristicType>
            <CharacteristicValue>_LVMenge</CharacteristicValue>
          </Parameter>
        </Parameters>
      </Assembly>
    </AssemblyDivision>
  </AssemblyCatalog>
</AssemblyCatalogRoot>`

describe('parseCostAssemblyXml', () => {
  it('keeps catalog, assembly, sub-item and CoC fields', () => {
    const catalog = parseCostAssemblyXml(SAMPLE, { path: 'Cost Assembly.xml', name: 'Cost Assembly.xml' })
    expect(catalog.projectName).toBe('PL-01')
    expect(catalog.cgrCatalogs.map((item) => item.name)).toEqual(['Allowances', 'CC'])
    expect(catalog.catalogName).toBe('BstnKat 1')
    expect(catalog.assemblies).toHaveLength(1)
    const assembly = catalog.assemblies[0]
    expect(assembly.code).toBe('26.21.11.')
    expect(assembly.uom).toBe('m3')
    expect(assembly.hours).toBeCloseTo(0.85)
    expect(assembly.details.subItems[0].phase).toBe('Tender')
    expect(assembly.details.subItems[0].details.components[0].kind).toBe('labor')
    expect(assembly.details.subItems[0].details.components[0].amount).toBeCloseTo(34.816)
    expect(assembly.labor).toBeCloseTo(34.816)
    expect(assembly.material).toBeCloseTo(0.63)
    expect(assembly.parameters[0].code).toBe('Volume')
    expect(catalog.root[0].assemblies[0].category).toBe('26.21.')
  })

  it('rejects a different root element', () => {
    expect(() => parseCostAssemblyXml('<Project/>', { path: 'x.xml', name: 'x.xml' })).toThrow(/AssemblyCatalogRoot/)
  })
})

describe('assembly search', () => {
  it('matches code, category and cost-component names', () => {
    const catalog = parseCostAssemblyXml(SAMPLE, { path: 'x.xml', name: 'x.xml' })
    const assembly = catalog.assemblies[0]
    expect(matchesQuery(assembly, '26.21.11')).toBe(true)
    expect(matchesQuery(assembly, 'formwork')).toBe(true)
    expect(matchesQuery(assembly, 'Concrete Wall')).toBe(true)
    expect(matchesQuery(assembly, 'LO21.32')).toBe(true)
    expect(matchesQuery(assembly, 'steel beams')).toBe(false)
    expect(filterDivisionTree(catalog.root, 'walls')[0]?.assemblies).toHaveLength(1)
  })
})

describe('local Cost Assembly.xml', () => {
  it('parses the on-disk catalog without dropping assemblies', async () => {
    const { existsSync, readFileSync } = await import('node:fs')
    const path =
      'C:\\Users\\Shobhit_S\\OneDrive - verstraetebouw.be\\Documents\\IFCLite\\Cost Assembly Store\\Cost Assembly.xml'
    if (!existsSync(path)) return
    const catalog = parseCostAssemblyXml(readFileSync(path, 'utf8'), { path, name: 'Cost Assembly.xml' })
    expect(catalog.assemblies.map((item) => item.code)).toEqual([
      '26.21.11.',
      '26.21.23.m2',
      '26.22.00.',
      '26.23.01.',
      '26.25.02.',
      '26.26.10.',
      '26.26.30.',
    ])
    expect(catalog.assemblies[0].details.subItems.length).toBeGreaterThan(0)
    expect(catalog.assemblies[0].labor + catalog.assemblies[0].material + catalog.assemblies[0].equipment).toBeGreaterThan(0)
    expect(catalog.cgrCatalogs).toHaveLength(4)
  })
})

import { describe, expect, it } from 'vitest'
import { buildUpRows } from '@/lib/cost-assembly/build-up'
import { ancestorMultipliers, evaluatedRowQty } from '@/lib/cost-assembly/evaluate'
import { parseCostAssemblyXml } from '@/lib/cost-assembly/parse'

// Mirrors the real catalog's rebar shape: SubItem B (WAP kg/m3) splits into B1/B2 (net vs bar
// ratio), each with its own CoCDetail cost lines priced per kg.
const XML = `<?xml version="1.0"?>
<AssemblyCatalogRoot>
  <AssemblyCatalog>
    <AssemblyDivision>
      <NameAssembly>26.21.</NameAssembly>
      <Assembly>
        <NameAssembly>26.21.11.</NameAssembly>
        <AssemblyUoM>m3</AssemblyUoM>
        <EstDetails>
          <SubItem>
            <SubitemNumber>B</SubitemNumber>
            <Quantity>110</Quantity>
            <QuantityDetail>WAP</QuantityDetail>
            <Factor>1</Factor>
            <CostFactor>1</CostFactor>
            <SItemNo>B</SItemNo>
            <Text><txt language="en">Rebar</txt></Text>
            <UnitOfMeasure>kg</UnitOfMeasure>
            <EstDetails>
              <SubItem>
                <SubitemNumber>B1</SubitemNumber>
                <Quantity>0.8</Quantity>
                <QuantityDetail>90/110</QuantityDetail>
                <Factor>1</Factor>
                <CostFactor>1</CostFactor>
                <SItemNo>1</SItemNo>
                <Text><txt language="en">Rebar nets</txt></Text>
                <UnitOfMeasure>kg</UnitOfMeasure>
                <EstDetails>
                  <CoCDetail>
                    <NameCoC>LO21.40.WAP</NameCoC>
                    <DescrCoC><txt language="en">Rebar labor</txt></DescrCoC>
                    <CURCoC>EUR</CURCoC>
                    <Quantity>1</Quantity>
                    <Factor>0.012</Factor>
                    <URValue>40.96</URValue>
                    <CostFactor>1</CostFactor>
                    <CFactorCoC>1</CFactorCoC>
                    <QFactorCoC>1</QFactorCoC>
                  </CoCDetail>
                </EstDetails>
              </SubItem>
            </EstDetails>
          </SubItem>
        </EstDetails>
        <AssemblyCurrency>EUR</AssemblyCurrency>
        <IsAssembly>1</IsAssembly>
        <Costs>0</Costs>
        <Hours>0</Hours>
        <Parameters>
          <Parameter>
            <CharacteristicObjectCode>Volume</CharacteristicObjectCode>
            <CharacteristicDescription>Volume | Volume</CharacteristicDescription>
            <CharacteristicType>Addable</CharacteristicType>
            <CharacteristicValue>_LVMenge</CharacteristicValue>
          </Parameter>
          <Parameter>
            <CharacteristicObjectCode>WAP</CharacteristicObjectCode>
            <CharacteristicDescription>Rebar kg/m3 | Rebar kg/m3</CharacteristicDescription>
            <CharacteristicType>Addable</CharacteristicType>
            <CharacteristicValue>0* 110</CharacteristicValue>
          </Parameter>
        </Parameters>
      </Assembly>
    </AssemblyDivision>
  </AssemblyCatalog>
</AssemblyCatalogRoot>`

describe('ancestorMultipliers / evaluatedRowQty', () => {
  it('multiplies a leaf cost line by every ancestor group ratio, not just its own quantity', () => {
    const catalog = parseCostAssemblyXml(XML, { path: 'x.xml', name: 'x.xml' })
    const assembly = catalog.assemblies[0]
    const rows = buildUpRows(assembly.details)
    const leaf = rows.find((row) => row.code === 'LO21.40.WAP')!
    const noOverride = () => 0 // WAP override left at 0 -> still the catalog default "0* 110" == 0
    const multipliers = ancestorMultipliers(rows, noOverride)
    // With WAP=0 (unset) the whole rebar branch should be worth nothing yet.
    expect(multipliers.get(leaf.id)).toBe(0)

    const withOverride = (name: string) => (name === 'WAP' ? 25 : 0)
    const withRebar = ancestorMultipliers(rows, withOverride)
    // B: qty = WAP = 25 (m3 is a straight kg/m3 ratio here); B1: qty = 90/110
    expect(withRebar.get(leaf.id)).toBeCloseTo(25 * (90 / 110))

    const leafAmount = (evaluatedRowQty(leaf, withOverride) * leaf.factor * leaf.extraFactors * (leaf.rate ?? 0)) * withRebar.get(leaf.id)!
    // 1 (leaf qty) * 0.012 (h/kg) * 40.96 (EUR/h) * 25 * 90/110 kg
    expect(leafAmount).toBeCloseTo(1 * 0.012 * 40.96 * 25 * (90 / 110))
  })
})

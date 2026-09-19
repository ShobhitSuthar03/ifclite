import { describe, expect, it } from 'vitest'
import { countIfcBuildingsInBytes } from '@/lib/ifc-loader'

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('countIfcBuildingsInBytes', () => {
  it('counts a single IfcBuilding as 1', () => {
    const text = "#34=IFCBUILDING('guid',#18,$,$,$,#32,$,'',.ELEMENT.,$,$,#33);"
    expect(countIfcBuildingsInBytes(bytesOf(text))).toBe(1)
  })

  it('counts multiple IfcBuilding declarations across a file', () => {
    const text = [
      "#34=IFCBUILDING('a',#18,$,$,$,#32,$,'',.ELEMENT.,$,$,#33);",
      "#603=IFCBUILDING('b',#18,$,$,$,#601,$,'',.ELEMENT.,$,$,#602);",
      "#336177=IFCBUILDING('c',#18,$,$,$,#336175,$,'',.ELEMENT.,$,$,#336176);",
    ].join('\n')
    expect(countIfcBuildingsInBytes(bytesOf(text))).toBe(3)
  })

  it('does not count IfcBuildingStorey or IfcBuildingElementProxy as an IfcBuilding', () => {
    const text = [
      "#661=IFCBUILDINGSTOREY('a',#18,'L1',$,$,#660,$,$,.ELEMENT.,0.);",
      "#700=IFCBUILDINGELEMENTPROXY('b',#18,$,$,$,#690,#695,$,$);",
    ].join('\n')
    expect(countIfcBuildingsInBytes(bytesOf(text))).toBe(0)
  })

  it('returns 0 for an empty or unrelated buffer', () => {
    expect(countIfcBuildingsInBytes(new Uint8Array())).toBe(0)
    expect(countIfcBuildingsInBytes(bytesOf('#1=IFCPROJECT($);'))).toBe(0)
  })
})

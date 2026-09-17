import type { AssemblyDivisionNode, CostAssembly, CostKind } from '@/lib/cost-assembly/types'
import { displayText, englishHint } from '@/lib/cost-assembly/types'

const SYNONYM_GROUPS: string[][] = [
  ['wall', 'walls', 'wand', 'wände', 'wande', 'muur', 'muren', 'wanden'],
  ['concrete', 'beton', 'castinplace', 'insitu', 'ortbeton', 'stortbeton'],
  ['slab', 'floor', 'floors', 'plaat', 'platten', 'decke', 'vloer', 'vloeren', 'plate'],
  ['column', 'columns', 'kolom', 'kolommen', 'stütze', 'stutze', 'pilaar', 'pillar'],
  ['beam', 'beams', 'balk', 'balken', 'träger', 'trager', 'ligger'],
  ['formwork', 'formwor', 'bekist', 'bekisting', 'schalung', 'shuttering'],
  ['foundation', 'footing', 'footings', 'fundering', 'funderingen', 'fundament'],
  ['door', 'doors', 'deur', 'deuren', 'tür', 'tur'],
  ['window', 'windows', 'raam', 'ramen', 'fenster'],
  ['stair', 'stairs', 'trap', 'trappen', 'treppe'],
  ['roof', 'dak', 'daken', 'dach'],
  ['cover', 'covering', 'finish', 'finishes', 'afwerking'],
]

const SYNONYMS = new Map<string, string[]>()
for (const group of SYNONYM_GROUPS) {
  for (const token of group) SYNONYMS.set(token, group)
}

export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/in-situ|cast-in-place|cast in place/g, ' concrete ')
    .split(/[^a-z0-9äöüß]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
}

export function expandTokens(query: string): string[] {
  const out = new Set<string>()
  for (const token of tokenizeQuery(query)) {
    out.add(token)
    const group = SYNONYMS.get(token)
    if (group) for (const alt of group) out.add(alt)
  }
  return [...out]
}

export function assemblyHaystack(assembly: CostAssembly): string {
  return [
    assembly.code,
    assembly.uom,
    assembly.category,
    assembly.path.join(' '),
    displayText(assembly.description),
    englishHint(assembly.description),
    ...assembly.parameters.flatMap((parameter) => [parameter.code, parameter.description, parameter.value ?? '']),
    ...collectCodes(assembly.details.subItems, assembly.details.components),
  ]
    .join(' ')
    .toLowerCase()
}

export function scoreAssembly(assembly: CostAssembly, query: string): number {
  const tokens = expandTokens(query)
  if (tokens.length === 0) return 1
  const hay = assemblyHaystack(assembly)
  let score = 0
  for (const token of tokens) {
    if (hay.includes(token)) score += token.length >= 5 ? 2 : 1
  }
  return score
}

export type RankedAssembly = {
  assembly: CostAssembly
  score: number
}

export function rankAssemblies(assemblies: CostAssembly[], query: string, limit = 15): RankedAssembly[] {
  const scored = assemblies
    .map((assembly) => ({ assembly, score: scoreAssembly(assembly, query) }))
    .filter((row) => (query.trim() ? row.score > 0 : true))
    .sort((a, b) => b.score - a.score || a.assembly.code.localeCompare(b.assembly.code))
  return scored.slice(0, Math.max(1, limit))
}

export function matchesQuery(assembly: CostAssembly, query: string): boolean {
  if (!query.trim()) return true
  return scoreAssembly(assembly, query) > 0
}

function collectCodes(
  items: CostAssembly['details']['subItems'],
  components: CostAssembly['details']['components'],
): string[] {
  const out: string[] = []
  for (const component of components) {
    out.push(component.name, displayText(component.description), displayText(component.extraDescription))
  }
  for (const item of items) {
    out.push(item.number, displayText(item.text), item.phase, item.estimateStatus)
    out.push(...collectCodes(item.details.subItems, item.details.components))
  }
  return out
}

export function filterDivisionTree(nodes: AssemblyDivisionNode[], query: string): AssemblyDivisionNode[] {
  if (!query.trim()) return nodes
  const needle = query.trim().toLowerCase()
  const keep = (node: AssemblyDivisionNode): AssemblyDivisionNode | null => {
    const self =
      node.code.toLowerCase().includes(needle) ||
      displayText(node.description).toLowerCase().includes(needle) ||
      englishHint(node.description).toLowerCase().includes(needle)
    if (self) return node
    const children = node.children.map(keep).filter((child): child is AssemblyDivisionNode => child != null)
    const assemblies = node.assemblies.filter((assembly) => matchesQuery(assembly, query))
    if (children.length === 0 && assemblies.length === 0) return null
    return { ...node, children, assemblies }
  }
  return nodes.map(keep).filter((node): node is AssemblyDivisionNode => node != null)
}

export const COST_KIND_LABEL: Record<CostKind, string> = {
  labor: 'Labor',
  material: 'Material',
  equipment: 'Plant',
  subcontractor: 'Subcontract',
  other: 'Other',
}

export const COST_KIND_SHORT: Record<CostKind, string> = {
  labor: 'L',
  material: 'M',
  equipment: 'P',
  subcontractor: 'S',
  other: 'O',
}

export function formatAssemblyMoney(value: number, currency = 'EUR'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

export function formatAssemblyUnit(uom: string): string {
  return uom.replace(/m3/gi, 'm³').replace(/m2/gi, 'm²').replace(/lm/gi, 'lm')
}

export function formatAssemblyQty(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (Number.isInteger(value)) return String(value)
  const text = value.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return text
}

export function formatHours(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '—'
  return `${formatAssemblyQty(value)} h`
}

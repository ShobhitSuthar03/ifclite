import { rankAssemblies, type RankedAssembly } from '@/lib/cost-assembly/search'
import type { CostAssembly } from '@/lib/cost-assembly/types'
import type { SkipHint } from '@/lib/estimator-tools/skip'

const TYPE_QUERY: Array<{ test: RegExp; query: string }> = [
  { test: /wall|curtain/i, query: 'wall wand muur' },
  { test: /slab|plate|roof/i, query: 'slab floor plaat' },
  { test: /column|pile/i, query: 'column kolom' },
  { test: /beam|member/i, query: 'beam balk' },
  { test: /foot|found/i, query: 'foundation footing fundering' },
  { test: /door/i, query: 'door deur' },
  { test: /window/i, query: 'window raam' },
  { test: /stair|ramp/i, query: 'stair trap' },
  { test: /cover|facing/i, query: 'covering finish afwerking' },
]

export function queryForIfcType(ifcType: string | undefined): string {
  if (!ifcType) return ''
  const mapped = TYPE_QUERY.find((row) => row.test.test(ifcType.replace(/^Ifc/i, '')))
  return mapped?.query ?? ''
}

export function classifyAssemblies(
  assemblies: CostAssembly[],
  input: { ifcType?: string; name?: string; query?: string; limit?: number },
): RankedAssembly[] {
  const query = [queryForIfcType(input.ifcType), input.name ?? '', input.query ?? ''].filter((part) => part.trim()).join(' ')
  return rankAssemblies(assemblies, query || ' ', input.limit ?? 8)
}

export function classifyFromHints(
  assemblies: CostAssembly[],
  hints: SkipHint[],
  extraQuery = '',
  limit = 8,
): RankedAssembly[] {
  const ifcType = hints.find((hint) => hint.ifcType)?.ifcType
  const name = hints.map((hint) => hint.name).filter(Boolean).join(' ')
  return classifyAssemblies(assemblies, { ifcType, name, query: extraQuery, limit })
}

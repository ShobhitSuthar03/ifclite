import { useState } from 'react'
import { Copy, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parseGlobalIds, resolveGlobalIds } from '@/lib/guid-search'
import type { BimDatabase } from '@/lib/bim-sql'
import type { IfcDataStore } from '@/lib/ifc-data'
import { formatCount } from '@/lib/utils'

type GuidSearchProps = {
  store: IfcDataStore | null
  warehouse: BimDatabase | null
  hasSelection: boolean
  onCopySelected: () => string[]
  onSelectScope: (ids: number[], additive?: boolean) => void
}

export function GuidSearch({ store, warehouse, hasSelection, onCopySelected, onSelectScope }: GuidSearchProps) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<{ foundCount: number; missing: string[] } | null>(null)

  const ready = Boolean(store || warehouse)

  const runSearch = () => {
    const ids = parseGlobalIds(text)
    if (ids.length === 0) {
      setResult(null)
      return
    }
    const { found, missing } = resolveGlobalIds(ids, store, warehouse)
    setResult({ foundCount: found.size, missing })
    if (found.size > 0) onSelectScope([...found.values()])
  }

  const copySelected = () => {
    const ids = onCopySelected()
    if (ids.length === 0) return
    setText(ids.join('\n'))
    setResult(null)
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <p className="mb-2 text-[11px] text-muted-foreground">
        Paste one or more IFC GlobalIds (one per line, or comma/space separated) to select those elements.
      </p>
      <textarea
        className="min-h-24 flex-1 resize-none rounded border border-border bg-background p-2 font-mono text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder={'1dN3$_JYmo_I7TaDZoCvJS\n3oNZ7u96BA3_WCVSyv6U9w\n...'}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setResult(null)
        }}
        spellCheck={false}
      />
      <div className="mt-2 flex items-center gap-1.5">
        <Button size="sm" className="h-7 flex-1 gap-1.5 text-[11px]" disabled={!ready || text.trim().length === 0} onClick={runSearch}>
          <Search className="h-3.5 w-3.5" />
          Select matches
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 shrink-0"
          disabled={!hasSelection}
          title="Copy GlobalIds of the current selection into the box"
          onClick={copySelected}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
      {!ready ? <p className="mt-2 text-[11px] text-muted-foreground italic">Load a model to search by GlobalId.</p> : null}
      {result ? (
        <div className="mt-2 space-y-1 text-[11px]">
          <p className={result.foundCount > 0 ? 'text-primary' : 'text-muted-foreground'}>
            {formatCount(result.foundCount)} matched{result.missing.length > 0 ? `, ${formatCount(result.missing.length)} not found` : ''}
          </p>
          {result.missing.length > 0 ? (
            <p className="truncate font-mono text-muted-foreground" title={result.missing.join(', ')}>
              Not found: {result.missing.join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

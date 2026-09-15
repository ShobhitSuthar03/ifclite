import { useMemo, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  CSV_DELIMITERS,
  CSV_MODES,
  CSV_SCOPES,
  downloadCsvFile,
  exportAreasCsv,
  exportFormworkCsv,
  exportIfcCsv,
  resolveCsvKeepIds,
  type CsvDelimiter,
  type CsvMode,
  type CsvScope,
} from '@/lib/csv-export'
import type { QuantityResult } from '@/lib/geometry-qto'
import { cn, formatCount } from '@/lib/utils'

const fieldClass =
  'h-8 w-full rounded border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-primary disabled:opacity-50'

type CsvExportPanelProps = {
  fileName: string
  bytes: Uint8Array | null
  isolatedIds: Set<number> | null
  visibleIds: Set<number>
  selectedIds: Set<number>
  formwork: QuantityResult | null
  onExported: (message: string) => void
  onError: (message: string) => void
}

export function CsvExportPanel({
  fileName,
  bytes,
  isolatedIds,
  visibleIds,
  selectedIds,
  formwork,
  onExported,
  onError,
}: CsvExportPanelProps) {
  const [mode, setMode] = useState<CsvMode>('entities')
  const [scope, setScope] = useState<CsvScope>('all')
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(',')
  const [includeProperties, setIncludeProperties] = useState(true)
  const [busy, setBusy] = useState(false)

  const isolatedCount = isolatedIds?.size ?? null
  const canIsolated = isolatedIds != null
  const canSelected = selectedIds.size > 0
  const activeScope =
    (scope === 'isolated' && !canIsolated) || (scope === 'selected' && !canSelected) ? 'all' : scope
  const keepIds = useMemo(
    () => resolveCsvKeepIds(activeScope, isolatedIds, visibleIds, selectedIds),
    [activeScope, isolatedIds, visibleIds, selectedIds],
  )

  const onDownload = async () => {
    if (mode === 'formwork' || mode === 'areas') {
      if (!formwork) {
        onError('Geometry quantities are not ready yet. Wait for the model to finish loading.')
        return
      }
      setBusy(true)
      try {
        const result =
          mode === 'areas'
            ? exportAreasCsv(formwork, fileName, activeScope, delimiter, keepIds)
            : exportFormworkCsv(formwork, fileName, activeScope, delimiter, keepIds)
        downloadCsvFile(result.fileName, result.text)
        onExported(
          `Exported ${formatCount(result.rowCount)} ${mode === 'areas' ? 'area' : 'face'} row${result.rowCount === 1 ? '' : 's'} → ${result.fileName}`,
        )
      } catch (caught) {
        onError(caught instanceof Error ? caught.message : String(caught))
      } finally {
        setBusy(false)
      }
      return
    }
    if (!bytes) {
      onError('Load an IFC file before exporting CSV.')
      return
    }
    setBusy(true)
    try {
      const result = await exportIfcCsv({
        bytes,
        fileName,
        mode,
        delimiter,
        includeProperties,
        keepIds,
        scope: activeScope,
      })
      downloadCsvFile(result.fileName, result.text)
      onExported(
        `Exported ${formatCount(result.rowCount)} ${mode} row${result.rowCount === 1 ? '' : 's'} → ${result.fileName}`,
      )
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-auto p-3">
      <label className="flex flex-col gap-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Table
        <select className={fieldClass} value={mode} onChange={(event) => setMode(event.target.value as CsvMode)}>
          {CSV_MODES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Scope
        <select
          className={fieldClass}
          value={activeScope}
          onChange={(event) => setScope(event.target.value as CsvScope)}
        >
          {CSV_SCOPES.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={(option.value === 'isolated' && !canIsolated) || (option.value === 'selected' && !canSelected)}
            >
              {option.label}
              {option.value === 'isolated' && isolatedCount != null ? ` (${formatCount(isolatedCount)})` : ''}
              {option.value === 'selected' && selectedIds.size > 0
                ? ` (${formatCount(selectedIds.size)})`
                : ''}
              {option.value === 'visible' ? ` (${formatCount(visibleIds.size)})` : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Delimiter
        <select
          className={fieldClass}
          value={delimiter}
          onChange={(event) => setDelimiter(event.target.value as CsvDelimiter)}
        >
          {CSV_DELIMITERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className={cn('flex items-center gap-2 text-xs', mode !== 'entities' && 'opacity-50')}>
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-primary"
          checked={includeProperties && mode === 'entities'}
          disabled={mode !== 'entities'}
          onChange={(event) => setIncludeProperties(event.target.checked)}
        />
        Include flattened property columns
      </label>
      <p className="text-[11px] text-muted-foreground">{CSV_MODES.find((item) => item.value === mode)?.hint}.</p>
      <Button
        size="sm"
        className="mt-1 bg-[#28a745] text-white hover:bg-[#28a745]/90"
        onClick={() => void onDownload()}
        disabled={busy || (mode === 'formwork' || mode === 'areas' ? !formwork : !bytes)}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Download />}
        Generate CSV
      </Button>
    </div>
  )
}

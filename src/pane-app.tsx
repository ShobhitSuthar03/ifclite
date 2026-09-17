import { useEffect, useState } from 'react'
import { AssemblyBuildUp } from '@/components/assembly-buildup'
import type { CostAssembly } from '@/lib/cost-assembly/types'
import type { PropertyCatalogSet } from '@/lib/bim-sql'
import type { QuantityResult } from '@/lib/geometry-qto'
import type { ParamBinding } from '@/lib/estimation/param-bind'
import type { QtyBinding } from '@/lib/estimation/qty-bind'
import { listenPaneState, notifyPaneClosed, sendPaneAction, type PaneId } from '@/lib/pane-sync'

export type BuildUpPaneState = {
  assembly: CostAssembly | null
  elementIds: number[]
  assemblyQty: number | null
  quantities: QuantityResult | null
  propertyCatalog: PropertyCatalogSet[]
  bindings: Record<string, QtyBinding>
  excludedLines: Record<string, boolean>
  parameterOverrides: Record<string, string>
  parameterBindings: Record<string, ParamBinding>
  emptyHint: string
}

export type BuildUpPaneAction =
  | { type: 'bind'; rowId: string; binding: QtyBinding }
  | { type: 'excluded'; excluded: Record<string, boolean> }
  | { type: 'parameter'; code: string; value: string }
  | { type: 'paramBinding'; code: string; binding: ParamBinding }

export function PaneApp({ paneId }: { paneId: PaneId }) {
  useEffect(() => {
    const onUnload = () => {
      notifyPaneClosed(paneId)
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [paneId])

  if (paneId === 'buildup') return <BuildUpPane />
  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-background p-6 text-center text-[13px] text-muted-foreground">
      This panel can't be detached yet — pop out the Assembly build-up panel instead.
    </div>
  )
}

function BuildUpPane() {
  const [state, setState] = useState<BuildUpPaneState | null>(null)

  useEffect(() => {
    let unlisten: (() => void) | null = null
    listenPaneState<BuildUpPaneState>('buildup', setState).then((fn) => {
      unlisten = fn
    })
    return () => unlisten?.()
  }, [])

  if (!state) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center bg-background text-[13px] text-muted-foreground">
        Waiting for the main window…
      </div>
    )
  }

  return (
    <div className="h-screen min-h-0 bg-background">
      <AssemblyBuildUp
        assembly={state.assembly}
        elementIds={state.elementIds}
        assemblyQty={state.assemblyQty}
        quantities={state.quantities}
        propertyCatalog={state.propertyCatalog}
        bindings={state.bindings}
        excludedLines={state.excludedLines}
        parameterOverrides={state.parameterOverrides}
        parameterBindings={state.parameterBindings}
        emptyHint={state.emptyHint}
        onBind={(rowId, binding) => sendPaneAction('buildup', { type: 'bind', rowId, binding } satisfies BuildUpPaneAction)}
        onExcludedChange={(excluded) => sendPaneAction('buildup', { type: 'excluded', excluded } satisfies BuildUpPaneAction)}
        onParameterOverrideChange={(code, value) =>
          sendPaneAction('buildup', { type: 'parameter', code, value } satisfies BuildUpPaneAction)
        }
        onParamBindingChange={(code, binding) =>
          sendPaneAction('buildup', { type: 'paramBinding', code, binding } satisfies BuildUpPaneAction)
        }
      />
    </div>
  )
}

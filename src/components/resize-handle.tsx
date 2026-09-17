type ResizeHandleProps = {
  label: string
  axis?: 'x' | 'y'
  onDrag: (delta: number) => void
  onDragEnd?: () => void
  onReset: () => void
}

export function ResizeHandle({ label, axis = 'x', onDrag, onDragEnd, onReset }: ResizeHandleProps) {
  const vertical = axis === 'x'
  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={label}
      title={`${label} · drag to resize, double-click to reset`}
      className={
        vertical
          ? 'relative z-20 hidden w-px shrink-0 cursor-col-resize self-stretch bg-border hover:bg-primary lg:block'
          : 'relative z-20 h-px w-full shrink-0 cursor-row-resize bg-border hover:bg-primary'
      }
      style={{ touchAction: 'none' }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        const handle = event.currentTarget
        let last = vertical ? event.clientX : event.clientY
        handle.setPointerCapture(event.pointerId)
        document.body.classList.add('is-resizing-panels')

        const onMove = (move: PointerEvent) => {
          const next = vertical ? move.clientX : move.clientY
          const delta = next - last
          last = next
          if (delta) onDrag(delta)
        }
        const onUp = () => {
          handle.releasePointerCapture(event.pointerId)
          document.body.classList.remove('is-resizing-panels')
          handle.removeEventListener('pointermove', onMove)
          handle.removeEventListener('pointerup', onUp)
          handle.removeEventListener('pointercancel', onUp)
          onDragEnd?.()
        }
        handle.addEventListener('pointermove', onMove)
        handle.addEventListener('pointerup', onUp)
        handle.addEventListener('pointercancel', onUp)
      }}
      onDoubleClick={onReset}
    >
      {vertical ? (
        <span className="absolute inset-y-0 -left-1.5 w-3 cursor-col-resize" />
      ) : (
        <span className="absolute inset-x-0 -top-1.5 h-3 cursor-row-resize" />
      )}
    </div>
  )
}

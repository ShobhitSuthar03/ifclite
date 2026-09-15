type ResizeHandleProps = {
  label: string
  onDrag: (deltaX: number) => void
  onDragEnd?: () => void
  onReset: () => void
}

export function ResizeHandle({ label, onDrag, onDragEnd, onReset }: ResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={`${label} · drag to resize, double-click to reset`}
      className="relative z-20 hidden w-px shrink-0 cursor-col-resize self-stretch bg-border hover:bg-primary lg:block"
      style={{ touchAction: 'none' }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        const handle = event.currentTarget
        let last = event.clientX
        handle.setPointerCapture(event.pointerId)
        document.body.classList.add('is-resizing-panels')

        const onMove = (move: PointerEvent) => {
          const delta = move.clientX - last
          last = move.clientX
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
      <span className="absolute inset-y-0 -left-1.5 w-3 cursor-col-resize" />
    </div>
  )
}

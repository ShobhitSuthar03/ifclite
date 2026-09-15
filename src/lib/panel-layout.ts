import { useCallback, useRef, useState } from 'react'

const LEFT_KEY = 'ifclite.leftPanelWidth'
const RIGHT_KEY = 'ifclite.rightPanelWidth'
export const LEFT_PANEL_DEFAULT = 320
export const RIGHT_PANEL_DEFAULT = 340
export const PANEL_MIN = 220
export const PANEL_MAX = 560
export const VIEWPORT_MIN = 280

function readStored(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const value = Number(raw)
    return Number.isFinite(value) ? clamp(value, PANEL_MIN, PANEL_MAX) : fallback
  } catch {
    return fallback
  }
}

function writeStored(key: string, value: number) {
  try {
    localStorage.setItem(key, String(Math.round(value)))
  } catch {
    /* private mode */
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function applyWidth(pane: HTMLElement | null, width: number) {
  if (pane) pane.style.width = `${Math.round(width)}px`
}

export function usePanelWidths() {
  const [leftWidth, setLeftWidth] = useState(() => readStored(LEFT_KEY, LEFT_PANEL_DEFAULT))
  const [rightWidth, setRightWidth] = useState(() => readStored(RIGHT_KEY, RIGHT_PANEL_DEFAULT))
  const leftRef = useRef(leftWidth)
  const rightRef = useRef(rightWidth)

  const dragLeft = useCallback((delta: number, containerWidth: number, pane: HTMLElement | null) => {
    const max = Math.min(PANEL_MAX, Math.max(PANEL_MIN, containerWidth - rightRef.current - VIEWPORT_MIN))
    const next = clamp(leftRef.current + delta, PANEL_MIN, max)
    leftRef.current = next
    applyWidth(pane, next)
  }, [])

  const dragRight = useCallback((delta: number, containerWidth: number, pane: HTMLElement | null) => {
    const max = Math.min(PANEL_MAX, Math.max(PANEL_MIN, containerWidth - leftRef.current - VIEWPORT_MIN))
    const next = clamp(rightRef.current - delta, PANEL_MIN, max)
    rightRef.current = next
    applyWidth(pane, next)
  }, [])

  const commitLeft = useCallback(() => {
    const next = Math.round(leftRef.current)
    setLeftWidth(next)
    writeStored(LEFT_KEY, next)
  }, [])

  const commitRight = useCallback(() => {
    const next = Math.round(rightRef.current)
    setRightWidth(next)
    writeStored(RIGHT_KEY, next)
  }, [])

  const resetLeft = useCallback((pane: HTMLElement | null) => {
    leftRef.current = LEFT_PANEL_DEFAULT
    applyWidth(pane, LEFT_PANEL_DEFAULT)
    setLeftWidth(LEFT_PANEL_DEFAULT)
    writeStored(LEFT_KEY, LEFT_PANEL_DEFAULT)
  }, [])

  const resetRight = useCallback((pane: HTMLElement | null) => {
    rightRef.current = RIGHT_PANEL_DEFAULT
    applyWidth(pane, RIGHT_PANEL_DEFAULT)
    setRightWidth(RIGHT_PANEL_DEFAULT)
    writeStored(RIGHT_KEY, RIGHT_PANEL_DEFAULT)
  }, [])

  return {
    leftWidth,
    rightWidth,
    dragLeft,
    dragRight,
    commitLeft,
    commitRight,
    resetLeft,
    resetRight,
  }
}

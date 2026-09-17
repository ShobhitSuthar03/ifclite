import { useCallback, useRef, useState } from 'react'

const LEFT_KEY = 'ifclite.leftPanelWidth'
const RIGHT_KEY = 'ifclite.rightPanelWidth'
const ESTIMATION_KEY = 'ifclite.estimationPanelWidth'
export const LEFT_PANEL_DEFAULT = 320
export const RIGHT_PANEL_DEFAULT = 340
export const ESTIMATION_PANEL_DEFAULT = 720
export const PANEL_MIN = 220
export const PANEL_MAX = 560
export const ESTIMATION_PANEL_MIN = 480
export const ESTIMATION_PANEL_MAX = 1200
export const VIEWPORT_MIN = 280

function readStored(key: string, fallback: number, min = PANEL_MIN, max = PANEL_MAX): number {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const value = Number(raw)
    return Number.isFinite(value) ? clamp(value, min, max) : fallback
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
  const [estimationWidth, setEstimationWidth] = useState(() =>
    readStored(ESTIMATION_KEY, ESTIMATION_PANEL_DEFAULT, ESTIMATION_PANEL_MIN, ESTIMATION_PANEL_MAX),
  )
  const leftRef = useRef(leftWidth)
  const rightRef = useRef(rightWidth)
  const estimationRef = useRef(estimationWidth)

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

  const dragEstimation = useCallback((delta: number, containerWidth: number, pane: HTMLElement | null) => {
    const max = Math.min(ESTIMATION_PANEL_MAX, Math.max(ESTIMATION_PANEL_MIN, containerWidth - VIEWPORT_MIN))
    const next = clamp(estimationRef.current - delta, ESTIMATION_PANEL_MIN, max)
    estimationRef.current = next
    applyWidth(pane, next)
  }, [])

  const commitEstimation = useCallback(() => {
    const next = Math.round(estimationRef.current)
    setEstimationWidth(next)
    writeStored(ESTIMATION_KEY, next)
  }, [])

  const resetEstimation = useCallback((pane: HTMLElement | null) => {
    estimationRef.current = ESTIMATION_PANEL_DEFAULT
    applyWidth(pane, ESTIMATION_PANEL_DEFAULT)
    setEstimationWidth(ESTIMATION_PANEL_DEFAULT)
    writeStored(ESTIMATION_KEY, ESTIMATION_PANEL_DEFAULT)
  }, [])

  return {
    leftWidth,
    rightWidth,
    estimationWidth,
    dragLeft,
    dragRight,
    dragEstimation,
    commitLeft,
    commitRight,
    commitEstimation,
    resetLeft,
    resetRight,
    resetEstimation,
  }
}

export type EstimationPaneId = 'boq' | 'buildup' | 'chat'

export type EstimationPanes = {
  boq: boolean
  buildup: boolean
  chat: boolean
}

const ESTIMATION_PANES_KEY = 'ifclite.estimationPanes'
const DEFAULT_ESTIMATION_PANES: EstimationPanes = { boq: true, buildup: true, chat: true }

function readEstimationPanes(): EstimationPanes {
  try {
    const raw = localStorage.getItem(ESTIMATION_PANES_KEY)
    if (!raw) return { ...DEFAULT_ESTIMATION_PANES }
    const parsed = JSON.parse(raw) as Partial<EstimationPanes>
    return {
      boq: parsed.boq !== false,
      buildup: parsed.buildup !== false,
      chat: parsed.chat !== false,
    }
  } catch {
    return { ...DEFAULT_ESTIMATION_PANES }
  }
}

function writeEstimationPanes(value: EstimationPanes) {
  try {
    localStorage.setItem(ESTIMATION_PANES_KEY, JSON.stringify(value))
  } catch {
    /* private mode */
  }
}

export function useEstimationPanes() {
  const [panes, setPanes] = useState<EstimationPanes>(readEstimationPanes)

  const setPane = useCallback((id: EstimationPaneId, open: boolean) => {
    setPanes((current) => {
      const next = { ...current, [id]: open }
      writeEstimationPanes(next)
      return next
    })
  }, [])

  const togglePane = useCallback((id: EstimationPaneId) => {
    setPanes((current) => {
      const next = { ...current, [id]: !current[id] }
      writeEstimationPanes(next)
      return next
    })
  }, [])

  return { panes, setPane, togglePane }
}


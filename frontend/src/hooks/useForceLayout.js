import { useRef, useEffect, useCallback, useState } from 'react'
import { ForceLayout } from '../lib/topology'

export default function useForceLayout({
  services,
  dependencies,
  width,
  height,
  onTick,
  storageKey,
  options = {}
}) {
  const layoutRef = useRef(null)
  const [isStable, setIsStable] = useState(false)
  const stableCheckRef = useRef(null)
  const animFrameRef = useRef(null)
  const prevServicesRef = useRef([])

  const getLayout = useCallback(() => {
    if (!layoutRef.current && width && height) {
      layoutRef.current = new ForceLayout({ width, height, ...options })
    }
    return layoutRef.current
  }, [width, height, options])

  const savePositions = useCallback(() => {
    if (!layoutRef.current || !storageKey) return
    try {
      const positions = layoutRef.current.getPositions()
      const pinned = layoutRef.current.getPinnedIds()
      const data = { positions, pinned, ts: Date.now() }
      localStorage.setItem(storageKey, JSON.stringify(data))
    } catch (e) {
      console.warn('[useForceLayout] Failed to save positions:', e)
    }
  }, [storageKey])

  const loadPositions = useCallback(() => {
    if (!storageKey) return null
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return null
      return JSON.parse(raw)
    } catch (e) {
      console.warn('[useForceLayout] Failed to load positions:', e)
      return null
    }
  }, [storageKey])

  const scheduleSave = useCallback(() => {
    if (!storageKey) return
    if (stableCheckRef.current) clearTimeout(stableCheckRef.current)
    stableCheckRef.current = setTimeout(savePositions, 500)
  }, [storageKey, savePositions])

  const start = useCallback(() => {
    const layout = getLayout()
    if (!layout) return
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)

    let stableFrames = 0
    const tick = () => {
      if (!layoutRef.current) return
      const maxV = layout.step()
      onTick?.()

      if (maxV < layout.minVelocity * 2) {
        stableFrames += 1
        if (stableFrames > 15) {
          setIsStable(true)
          if (layout.autoFreezeOnStable) {
            for (const node of layout.nodes.values()) {
              if (!node.isNew) {
                layout.fixNode(node.id, node.x, node.y)
              }
            }
          }
          scheduleSave()
          animFrameRef.current = null
          return
        }
      } else {
        stableFrames = 0
        setIsStable(false)
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
  }, [getLayout, onTick, scheduleSave])

  const stop = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    layoutRef.current?.stop()
  }, [])

  const reset = useCallback(() => {
    const layout = getLayout()
    if (!layout) return
    try {
      if (storageKey) localStorage.removeItem(storageKey)
    } catch (e) {}
    layout.unfreezeAll()
    const w = layout.width
    const h = layout.height
    for (const node of layout.nodes.values()) {
      node.x = w / 2 + (Math.random() - 0.5) * 300
      node.y = h / 2 + (Math.random() - 0.5) * 300
      node.vx = (Math.random() - 0.5) * 2
      node.vy = (Math.random() - 0.5) * 2
      node.isNew = false
    }
    start()
  }, [getLayout, storageKey, start])

  const relayout = useCallback(() => {
    const layout = getLayout()
    if (!layout) return
    layout.unfreezeAll()
    for (const node of layout.nodes.values()) {
      node.vx = (Math.random() - 0.5) * 4
      node.vy = (Math.random() - 0.5) * 4
      node.isNew = false
    }
    start()
  }, [getLayout, start])

  const setSize = useCallback((w, h) => {
    layoutRef.current?.setSize(w, h)
  }, [])

  const fixNode = useCallback((id, x, y) => {
    layoutRef.current?.fixNode(id, x, y)
  }, [])

  const releaseNode = useCallback((id) => {
    const layout = layoutRef.current
    if (!layout) return
    layout.releaseNode(id)
    const node = layout.nodes.get(id)
    if (node) node.isNew = false
  }, [])

  const getNodeAt = useCallback((x, y) => {
    return layoutRef.current?.getNodeAt(x, y) || null
  }, [])

  const getEdgeAt = useCallback((x, y, threshold) => {
    return layoutRef.current?.getEdgeAt(x, y, threshold) || null
  }, [])

  const getNodePosition = useCallback((id) => {
    const node = layoutRef.current?.nodes.get(id)
    return node ? { x: node.x, y: node.y } : null
  }, [])

  const freezeAll = useCallback(() => {
    layoutRef.current?.freezeAll()
    scheduleSave()
  }, [scheduleSave])

  const unfreezeAll = useCallback(() => {
    const layout = layoutRef.current
    if (!layout) return
    layout.unfreezeAll()
    for (const node of layout.nodes.values()) {
      node.isNew = false
    }
    start()
  }, [start])

  useEffect(() => {
    const layout = getLayout()
    if (!layout) return

    const prevIds = new Set(prevServicesRef.current.map(s => s.id))
    const currIds = new Set(services.map(s => s.id))
    const hasNew = services.some(s => !prevIds.has(s.id))
    const hasRemoved = prevServicesRef.current.some(s => !currIds.has(s.id))

    if (storageKey) {
      const saved = loadPositions()
      if (saved?.positions) {
        layout.setSavedPositions(saved.positions)
      }
      if (saved?.pinned && saved.pinned.length > 0 && !hasNew && !hasRemoved) {
        layout.setPinnedIds(saved.pinned)
      }
    }

    layout.setData(services, dependencies)
    prevServicesRef.current = services

    if (hasNew) {
      const newIds = layout.getNewNodeIds()
      for (const id of newIds) {
        layout.releaseNode(id)
      }
    }

    start()

    return () => {
      stop()
      savePositions()
      if (stableCheckRef.current) clearTimeout(stableCheckRef.current)
    }
  }, [services, dependencies, getLayout, start, stop, savePositions, loadPositions, storageKey])

  useEffect(() => {
    if (width && height) {
      setSize(width, height)
    }
  }, [width, height, setSize])

  return {
    layout: layoutRef.current,
    isStable,
    start,
    stop,
    reset,
    relayout,
    setSize,
    fixNode,
    releaseNode,
    getNodeAt,
    getEdgeAt,
    getNodePosition,
    savePositions,
    scheduleSave,
    freezeAll,
    unfreezeAll,
    nodes: layoutRef.current?.nodes || new Map(),
    edges: layoutRef.current?.edges || []
  }
}

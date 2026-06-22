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
    layout.stop()
    let stableFrames = 0
    const tick = () => {
      if (!layoutRef.current) return
      const maxV = layout.step()
      onTick?.()

      if (maxV < layout.minVelocity * 2) {
        stableFrames += 1
        if (stableFrames > 10) {
          setIsStable(true)
          scheduleSave()
          return
        }
      } else {
        stableFrames = 0
        setIsStable(false)
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [getLayout, onTick, scheduleSave])

  const stop = useCallback(() => {
    layoutRef.current?.stop()
  }, [])

  const reset = useCallback(() => {
    const layout = getLayout()
    if (!layout) return
    try {
      if (storageKey) localStorage.removeItem(storageKey)
    } catch (e) {}
    for (const node of layout.nodes.values()) {
      layout.releaseNode(node.id)
    }
    const w = layout.width
    const h = layout.height
    for (const node of layout.nodes.values()) {
      node.x = w / 2 + (Math.random() - 0.5) * 300
      node.y = h / 2 + (Math.random() - 0.5) * 300
      node.vx = (Math.random() - 0.5) * 2
      node.vy = (Math.random() - 0.5) * 2
    }
    start()
  }, [getLayout, storageKey, start])

  const setSize = useCallback((w, h) => {
    layoutRef.current?.setSize(w, h)
  }, [])

  const fixNode = useCallback((id, x, y) => {
    layoutRef.current?.fixNode(id, x, y)
  }, [])

  const releaseNode = useCallback((id) => {
    layoutRef.current?.releaseNode(id)
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

  useEffect(() => {
    const layout = getLayout()
    if (!layout) return

    if (storageKey) {
      const saved = loadPositions()
      if (saved?.positions) {
        layout.setSavedPositions(saved.positions)
      }
    }

    layout.setData(services, dependencies)

    if (storageKey) {
      const saved = loadPositions()
      if (saved?.pinned && saved.pinned.length > 0) {
        layout.setPinnedIds(saved.pinned)
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
    setSize,
    fixNode,
    releaseNode,
    getNodeAt,
    getEdgeAt,
    getNodePosition,
    savePositions,
    scheduleSave,
    nodes: layoutRef.current?.nodes || new Map(),
    edges: layoutRef.current?.edges || []
  }
}

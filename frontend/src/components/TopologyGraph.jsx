import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import useForceLayout from '../hooks/useForceLayout'
import TopologyControls from './TopologyControls'
import TopologyLegend from './TopologyLegend'
import { getAffectedServices } from '../lib/topology'
import { lightenColor, darkenColor, STATUS_COLORS, TYPE_ICONS } from '../utils/graphColors'

export default function TopologyGraph({
  services,
  dependencies,
  selectedNodeId,
  onSelectNode,
  onEdgeClick,
  highlightFailed = true,
  storageKey = 'topology_positions'
}) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const transformRef = useRef({ x: 0, y: 0, scale: 1 })
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hoveredNode, setHoveredNode] = useState(null)
  const [hoveredEdge, setHoveredEdge] = useState(null)
  const [tooltip, setTooltip] = useState(null)
  const draggingRef = useRef(null)
  const panningRef = useRef(null)
  const renderTickRef = useRef(0)

  const failedIds = useMemo(() =>
    services.filter(s => s.summary?.status === 'down').map(s => s.id),
    [services]
  )

  const impact = useMemo(() => {
    if (!highlightFailed || failedIds.length === 0) return null
    return getAffectedServices(dependencies, failedIds)
  }, [dependencies, failedIds, highlightFailed])

  const getNodeColor = useCallback((node) => {
    const status = node.service?.summary?.status || 'unknown'
    if (impact) {
      const id = String(node.id)
      if (impact.failed.has(id)) return '#ef4444'
      if (impact.direct.has(id)) return '#f97316'
      if (impact.indirect.has(id)) return '#fbbf24'
    }
    return STATUS_COLORS[status] || STATUS_COLORS.unknown
  }, [impact])

  const canvasToWorld = useCallback((sx, sy) => {
    const { x: tx, y: ty, scale } = transformRef.current
    return { x: (sx - tx) / scale, y: (sy - ty) / scale }
  }, [])

  const {
    layout,
    nodes,
    edges,
    fixNode,
    getNodeAt,
    getEdgeAt,
    reset,
    scheduleSave
  } = useForceLayout({
    services,
    dependencies,
    width: size.width,
    height: size.height,
    storageKey,
    onTick: () => {
      renderTickRef.current += 1
    }
  })

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !layout) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()

    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)

    const { x: tx, y: ty, scale } = transformRef.current
    ctx.save()
    ctx.translate(tx, ty)
    ctx.scale(scale, scale)

    for (const edge of edges) {
      const source = nodes.get(edge.source)
      const target = nodes.get(edge.target)
      if (!source || !target) continue

      const isHighlighted = selectedNodeId !== null &&
        (edge.source === selectedNodeId || edge.target === selectedNodeId)
      const isHovered = hoveredEdge?.id === edge.id

      drawEdge(ctx, source, target, { isHighlighted, isHovered })
    }

    for (const node of nodes.values()) {
      const color = getNodeColor(node)
      const isSelected = selectedNodeId === node.id
      const isHovered = hoveredNode?.id === node.id
      const id = String(node.id)
      const isFailed = impact?.failed.has(id)
      const isDirect = impact?.direct.has(id)
      const isIndirect = impact?.indirect.has(id)

      drawNode(ctx, node, {
        color,
        isSelected,
        isHovered,
        isFailed,
        isDirect,
        isIndirect
      })
    }

    ctx.restore()
  }, [layout, nodes, edges, selectedNodeId, hoveredNode, hoveredEdge, getNodeColor, impact])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateSize = () => {
      const rect = container.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  useEffect(() => {
    let running = true
    const loop = () => {
      if (!running) return
      render()
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
    return () => { running = false }
  }, [render])

  const handleMouseDown = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const { x, y } = canvasToWorld(sx, sy)

    const node = getNodeAt(x, y)
    if (node) {
      draggingRef.current = { nodeId: node.id, startX: sx, startY: sy, moved: false }
      fixNode(node.id, node.x, node.y)
    } else {
      panningRef.current = {
        startX: sx,
        startY: sy,
        origX: transformRef.current.x,
        origY: transformRef.current.y
      }
    }
  }, [canvasToWorld, getNodeAt, fixNode])

  const handleMouseMove = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    if (draggingRef.current) {
      const { x, y } = canvasToWorld(sx, sy)
      fixNode(draggingRef.current.nodeId, x, y)
      draggingRef.current.moved = true
    } else if (panningRef.current) {
      transformRef.current.x = panningRef.current.origX + (sx - panningRef.current.startX)
      transformRef.current.y = panningRef.current.origY + (sy - panningRef.current.startY)
    } else {
      const { x, y } = canvasToWorld(sx, sy)
      const node = getNodeAt(x, y)
      const edge = node ? null : getEdgeAt(x, y)
      setHoveredNode(node)
      setHoveredEdge(edge)
      if (node || edge) {
        setTooltip({ x: sx, y: sy, node, edge })
        canvasRef.current.style.cursor = 'pointer'
      } else {
        setTooltip(null)
        canvasRef.current.style.cursor = 'grab'
      }
    }
  }, [canvasToWorld, fixNode, getNodeAt, getEdgeAt])

  const handleMouseUp = useCallback(() => {
    if (draggingRef.current) {
      if (!draggingRef.current.moved) {
        onSelectNode?.(draggingRef.current.nodeId)
      } else {
        scheduleSave()
      }
      draggingRef.current = null
    } else if (panningRef.current) {
      panningRef.current = null
    }
  }, [onSelectNode, scheduleSave])

  const handleMouseLeave = useCallback(() => {
    setHoveredNode(null)
    setHoveredEdge(null)
    setTooltip(null)
    if (draggingRef.current) {
      scheduleSave()
      draggingRef.current = null
    }
    panningRef.current = null
  }, [scheduleSave])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const rect = canvasRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const { x: tx, y: ty, scale } = transformRef.current

    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const newScale = Math.max(0.2, Math.min(5, scale * factor))
    const ratio = newScale / scale

    transformRef.current = {
      x: sx - (sx - tx) * ratio,
      y: sy - (sy - ty) * ratio,
      scale: newScale
    }
  }, [])

  const zoomIn = useCallback(() => {
    transformRef.current.scale = Math.min(5, transformRef.current.scale * 1.2)
  }, [])

  const zoomOut = useCallback(() => {
    transformRef.current.scale = Math.max(0.2, transformRef.current.scale / 1.2)
  }, [])

  const resetView = useCallback(() => {
    transformRef.current = { x: 0, y: 0, scale: 1 }
  }, [])

  const relayout = useCallback(() => {
    reset()
  }, [reset])

  const cursor = panningRef.current || draggingRef.current ? 'grabbing' : 'grab'

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 500 }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          cursor,
          background: '#f8fafc',
          borderRadius: 12
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      />

      <TopologyControls
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetView={resetView}
        onRelayout={relayout}
        position="top-right"
      />

      <TopologyLegend position="bottom-left" />

      {tooltip && (
        <div style={{
          position: 'absolute',
          left: tooltip.x + 15,
          top: tooltip.y + 15,
          background: '#1f2937',
          color: '#fff',
          padding: '8px 12px',
          borderRadius: 8,
          fontSize: 12,
          pointerEvents: 'none',
          zIndex: 20,
          maxWidth: 280,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          {tooltip.node && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{tooltip.node.name}</div>
              <div style={{ color: '#d1d5db', fontSize: 11 }}>
                类型: {tooltip.node.service?.type?.toUpperCase()}<br />
                状态: {tooltip.node.service?.summary?.status || '未知'}<br />
                可用率: {(tooltip.node.service?.summary?.availability ?? 0).toFixed(2)}%
              </div>
              {impact?.failed.has(String(tooltip.node.id)) && (
                <div style={{ color: '#ef4444', marginTop: 4, fontWeight: 600 }}>● 故障节点</div>
              )}
              {impact?.direct.has(String(tooltip.node.id)) && (
                <div style={{ color: '#f97316', marginTop: 4, fontWeight: 600 }}>● 直接受影响</div>
              )}
              {impact?.indirect.has(String(tooltip.node.id)) && (
                <div style={{ color: '#fbbf24', marginTop: 4, fontWeight: 600 }}>● 间接受影响</div>
              )}
            </div>
          )}
          {tooltip.edge && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>依赖关系</div>
              <div style={{ color: '#d1d5db', fontSize: 11 }}>
                {services.find(s => s.id === tooltip.edge.source)?.name || '?'} → {services.find(s => s.id === tooltip.edge.target)?.name || '?'}
              </div>
              {tooltip.edge.dep?.description && (
                <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 4 }}>{tooltip.edge.dep.description}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function drawEdge(ctx, source, target, { isHighlighted, isHovered }) {
  ctx.save()
  ctx.strokeStyle = isHovered ? '#6366f1' : isHighlighted ? '#818cf8' : '#cbd5e1'
  ctx.lineWidth = isHovered ? 3 : isHighlighted ? 2.5 : 1.5

  const dx = target.x - source.x
  const dy = target.y - source.y
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / dist
  const uy = dy / dist

  const sx = source.x + ux * source.radius
  const sy = source.y + uy * source.radius
  const ex = target.x - ux * (target.radius + 10)
  const ey = target.y - uy * (target.radius + 10)

  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.lineTo(ex, ey)
  ctx.stroke()

  const arrowSize = isHovered ? 12 : 8
  const ahx = ux * arrowSize
  const ahy = uy * arrowSize
  const apx = -uy * arrowSize * 0.5
  const apy = ux * arrowSize * 0.5

  ctx.fillStyle = ctx.strokeStyle
  ctx.beginPath()
  ctx.moveTo(ex, ey)
  ctx.lineTo(ex - ahx + apx, ey - ahy + apy)
  ctx.lineTo(ex - ahx - apx, ey - ahy - apy)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawNode(ctx, node, { color, isSelected, isHovered, isFailed, isDirect, isIndirect }) {
  ctx.save()

  if (isFailed || isDirect || isIndirect) {
    const pulseRadius = node.radius + (isFailed ? 20 : isDirect ? 15 : 10)
    const gradient = ctx.createRadialGradient(node.x, node.y, node.radius, node.x, node.y, pulseRadius)
    const colorMap = {
      failed: 'rgba(239,68,68,0.4)',
      direct: 'rgba(249,115,22,0.3)',
      indirect: 'rgba(251,191,36,0.25)'
    }
    const key = isFailed ? 'failed' : isDirect ? 'direct' : 'indirect'
    gradient.addColorStop(0, colorMap[key])
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(node.x, node.y, pulseRadius, 0, Math.PI * 2)
    ctx.fill()
  }

  if (isSelected || isHovered) {
    ctx.strokeStyle = isSelected ? '#6366f1' : '#94a3b8'
    ctx.lineWidth = isSelected ? 4 : 2
    ctx.beginPath()
    ctx.arc(node.x, node.y, node.radius + (isSelected ? 6 : 3), 0, Math.PI * 2)
    ctx.stroke()
  }

  const gradient = ctx.createRadialGradient(
    node.x - node.radius * 0.3, node.y - node.radius * 0.3, 0,
    node.x, node.y, node.radius
  )
  gradient.addColorStop(0, lightenColor(color, 40))
  gradient.addColorStop(1, color)

  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = darkenColor(color, 20)
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.fillStyle = '#fff'
  ctx.font = 'bold 20px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const icon = TYPE_ICONS[node.service?.type] || '📦'
  ctx.fillText(icon, node.x, node.y - 2)

  ctx.fillStyle = '#1f2937'
  ctx.font = '12px sans-serif'
  const name = node.name || `Service ${node.id}`
  const displayName = name.length > 14 ? name.substring(0, 12) + '...' : name
  ctx.fillText(displayName, node.x, node.y + node.radius + 16)

  const status = node.service?.summary?.status
  if (status === 'down') {
    ctx.fillStyle = '#ef4444'
    ctx.font = 'bold 10px sans-serif'
    ctx.fillText('故障', node.x, node.y + node.radius + 30)
  } else if (status === 'maintenance') {
    ctx.fillStyle = '#f59e0b'
    ctx.font = 'bold 10px sans-serif'
    ctx.fillText('维护中', node.x, node.y + node.radius + 30)
  }

  ctx.restore()
}

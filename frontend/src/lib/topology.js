export function buildAdjacencyList(dependencies) {
  const adjacency = new Map()
  const reverseAdjacency = new Map()
  for (const dep of dependencies) {
    if (!adjacency.has(dep.upstream_id)) adjacency.set(dep.upstream_id, [])
    if (!reverseAdjacency.has(dep.downstream_id)) reverseAdjacency.set(dep.downstream_id, [])
    adjacency.get(dep.upstream_id).push({ id: dep.downstream_id, dep })
    reverseAdjacency.get(dep.downstream_id).push({ id: dep.upstream_id, dep })
  }
  return { adjacency, reverseAdjacency }
}

export function getAffectedServices(dependencies, failedServiceIds) {
  const { adjacency } = buildAdjacencyList(dependencies)
  const affected = new Set()
  const direct = new Set()
  const queue = [...failedServiceIds]
  const level = new Map()

  for (const id of failedServiceIds) {
    affected.add(String(id))
    level.set(String(id), 0)
  }

  while (queue.length > 0) {
    const current = String(queue.shift())
    const currentLevel = level.get(current) || 0
    const neighbors = (adjacency.get(Number(current)) || []).map(n => n.id)
    for (const neighbor of neighbors) {
      const nKey = String(neighbor)
      if (!affected.has(nKey)) {
        affected.add(nKey)
        level.set(nKey, currentLevel + 1)
        if (currentLevel === 0) direct.add(nKey)
        queue.push(neighbor)
      }
    }
  }

  const indirect = new Set()
  const failedSet = new Set(failedServiceIds.map(String))
  for (const id of affected) {
    if (!failedSet.has(id) && !direct.has(id)) {
      indirect.add(id)
    }
  }

  return {
    failed: failedSet,
    direct,
    indirect,
    all: affected,
    levels: Object.fromEntries(level)
  }
}

export function getDirectDownstream(dependencies, serviceId) {
  const result = []
  for (const dep of dependencies) {
    if (dep.upstream_id === serviceId) result.push(dep.downstream_id)
  }
  return result
}

export function getDirectUpstream(dependencies, serviceId) {
  const result = []
  for (const dep of dependencies) {
    if (dep.downstream_id === serviceId) result.push(dep.upstream_id)
  }
  return result
}

export function detectCycles(dependencies) {
  const { adjacency } = buildAdjacencyList(dependencies)
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map()
  const cycles = []
  const path = []

  function dfs(node) {
    node = Number(node)
    color.set(node, GRAY)
    path.push(node)
    const neighbors = (adjacency.get(node) || []).map(n => n.id)
    for (const neighbor of neighbors) {
      const c = color.get(neighbor) || WHITE
      if (c === GRAY) {
        const cycleStart = path.indexOf(neighbor)
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart)
          cycle.push(neighbor)
          cycles.push([...cycle])
        }
      } else if (c === WHITE) {
        dfs(neighbor)
      }
    }
    path.pop()
    color.set(node, BLACK)
  }

  const allNodes = new Set()
  for (const dep of dependencies) {
    allNodes.add(dep.upstream_id)
    allNodes.add(dep.downstream_id)
  }

  for (const node of allNodes) {
    if ((color.get(node) || WHITE) === WHITE) {
      dfs(node)
    }
  }

  return cycles
}

export class ForceLayout {
  constructor(options = {}) {
    this.width = options.width || 800
    this.height = options.height || 600
    this.repulsion = options.repulsion || 5000
    this.attraction = options.attraction || 0.005
    this.damping = options.damping || 0.9
    this.centerGravity = options.centerGravity || 0.01
    this.minVelocity = options.minVelocity || 0.1
    this.nodes = new Map()
    this.edges = []
    this.animating = false
    this._rafId = null
    this.pinnedIds = new Set()
    this.savedPositions = new Map()
  }

  setSize(width, height) {
    this.width = width
    this.height = height
  }

  setSavedPositions(positions) {
    this.savedPositions = new Map()
    if (positions) {
      for (const [id, pos] of Object.entries(positions)) {
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
          this.savedPositions.set(Number(id), { x: pos.x, y: pos.y })
        }
      }
    }
  }

  getPositions() {
    const result = {}
    for (const [id, node] of this.nodes) {
      result[id] = { x: node.x, y: node.y }
    }
    return result
  }

  getPinnedIds() {
    return [...this.pinnedIds]
  }

  setPinnedIds(ids) {
    this.pinnedIds = new Set(ids ? ids.map(Number) : [])
    for (const id of this.pinnedIds) {
      const node = this.nodes.get(id)
      if (node) {
        node.fx = node.x
        node.fy = node.y
      }
    }
  }

  _getCentroid() {
    const nodeList = [...this.nodes.values()]
    if (nodeList.length === 0) return { x: this.width / 2, y: this.height / 2 }
    let sumX = 0, sumY = 0
    for (const n of nodeList) {
      sumX += n.x
      sumY += n.y
    }
    return { x: sumX / nodeList.length, y: sumY / nodeList.length }
  }

  _getSpread() {
    const nodeList = [...this.nodes.values()]
    if (nodeList.length === 0) return { radius: 100 }
    const c = this._getCentroid()
    let maxDist = 100
    for (const n of nodeList) {
      const d = Math.sqrt((n.x - c.x) ** 2 + (n.y - c.y) ** 2)
      if (d > maxDist) maxDist = d
    }
    return { centroid: c, radius: maxDist }
  }

  setData(services, dependencies) {
    const existingNodes = new Map(this.nodes)
    const existingPinned = new Set(this.pinnedIds)
    const prevCount = existingNodes.size

    this.nodes.clear()
    this.edges = []

    for (const svc of services) {
      const existing = existingNodes.get(svc.id)
      const saved = this.savedPositions.get(svc.id)
      const isPinned = existingPinned.has(svc.id)

      let x, y
      if (existing) {
        x = existing.x
        y = existing.y
      } else if (saved) {
        x = saved.x
        y = saved.y
      } else if (prevCount > 0) {
        const { centroid, radius } = this._getSpread()
        const angle = Math.random() * Math.PI * 2
        const dist = radius + 80 + Math.random() * 60
        x = centroid.x + Math.cos(angle) * dist
        y = centroid.y + Math.sin(angle) * dist
      } else {
        x = this.width / 2 + (Math.random() - 0.5) * 200
        y = this.height / 2 + (Math.random() - 0.5) * 200
      }

      const node = {
        id: svc.id,
        name: svc.name,
        x,
        y,
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
        fx: isPinned ? x : null,
        fy: isPinned ? y : null,
        service: svc,
        radius: 30
      }
      this.nodes.set(svc.id, node)
    }

    this.pinnedIds = new Set([...existingPinned].filter(id => this.nodes.has(id)))

    for (const dep of dependencies) {
      if (this.nodes.has(dep.upstream_id) && this.nodes.has(dep.downstream_id)) {
        this.edges.push({
          id: dep.id,
          source: dep.upstream_id,
          target: dep.downstream_id,
          dep
        })
      }
    }
  }

  fixNode(id, x, y) {
    const node = this.nodes.get(id)
    if (node) {
      node.fx = x
      node.fy = y
      node.x = x
      node.y = y
      node.vx = 0
      node.vy = 0
      this.pinnedIds.add(id)
    }
  }

  releaseNode(id) {
    const node = this.nodes.get(id)
    if (node) {
      node.fx = null
      node.fy = null
    }
    this.pinnedIds.delete(id)
  }

  step() {
    const nodeList = [...this.nodes.values()]
    const cx = this.width / 2
    const cy = this.height / 2

    for (let i = 0; i < nodeList.length; i++) {
      const a = nodeList[i]
      if (a.fx !== null) continue
      for (let j = i + 1; j < nodeList.length; j++) {
        const b = nodeList[j]
        let dx = a.x - b.x
        let dy = a.y - b.y
        let distSq = dx * dx + dy * dy
        if (distSq < 0.01) {
          dx = (Math.random() - 0.5) * 0.1
          dy = (Math.random() - 0.5) * 0.1
          distSq = dx * dx + dy * dy
        }
        const dist = Math.sqrt(distSq)
        const force = this.repulsion / distSq
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.vx += fx
        a.vy += fy
        if (b.fx === null) {
          b.vx -= fx
          b.vy -= fy
        }
      }
    }

    for (const edge of this.edges) {
      const source = this.nodes.get(edge.source)
      const target = this.nodes.get(edge.target)
      if (!source || !target) continue
      const dx = target.x - source.x
      const dy = target.y - source.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
      const force = dist * this.attraction
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      if (source.fx === null) {
        source.vx += fx
        source.vy += fy
      }
      if (target.fx === null) {
        target.vx -= fx
        target.vy -= fy
      }
    }

    let maxVelocity = 0
    for (const node of nodeList) {
      if (node.fx !== null) continue

      node.vx += (cx - node.x) * this.centerGravity
      node.vy += (cy - node.y) * this.centerGravity

      node.vx *= this.damping
      node.vy *= this.damping

      node.x += node.vx
      node.y += node.vy

      const padding = 50
      if (node.x < padding) { node.x = padding; node.vx *= -0.5 }
      if (node.x > this.width - padding) { node.x = this.width - padding; node.vx *= -0.5 }
      if (node.y < padding) { node.y = padding; node.vy *= -0.5 }
      if (node.y > this.height - padding) { node.y = this.height - padding; node.vy *= -0.5 }

      const v = Math.sqrt(node.vx * node.vx + node.vy * node.vy)
      if (v > maxVelocity) maxVelocity = v
    }

    return maxVelocity
  }

  start(onTick) {
    if (this.animating) return
    this.animating = true
    const tick = () => {
      if (!this.animating) return
      const maxV = this.step()
      onTick?.()
      if (maxV > this.minVelocity) {
        this._rafId = requestAnimationFrame(tick)
      } else {
        this.animating = false
      }
    }
    this._rafId = requestAnimationFrame(tick)
  }

  stop() {
    this.animating = false
    if (this._rafId) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }
  }

  getNodeAt(x, y) {
    for (const node of this.nodes.values()) {
      const dx = x - node.x
      const dy = y - node.y
      if (dx * dx + dy * dy <= node.radius * node.radius) {
        return node
      }
    }
    return null
  }

  getEdgeAt(x, y, threshold = 6) {
    for (const edge of this.edges) {
      const source = this.nodes.get(edge.source)
      const target = this.nodes.get(edge.target)
      if (!source || !target) continue
      const dist = this._pointToSegmentDist(x, y, source.x, source.y, target.x, target.y)
      if (dist <= threshold) return edge
    }
    return null
  }

  _pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1
    const dy = y2 - y1
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
    t = Math.max(0, Math.min(1, t))
    const cx = x1 + t * dx
    const cy = y1 + t * dy
    return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2)
  }
}

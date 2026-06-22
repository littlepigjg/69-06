import { ForceLayout, detectCycles, getAffectedServices } from '../src/lib/topology.js'

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ ${name}`)
    console.log(`    ${e.message}`)
    failed++
  }
}

function assert(condition, message = 'Assertion failed') {
  if (!condition) throw new Error(message)
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}`)
  }
}

function assertApprox(actual, expected, tolerance = 0.01, message = '') {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message} Expected ~${expected}, got ${actual}`)
  }
}

console.log('\n=== ForceLayout 单元测试 ===\n')

console.log('1. 基础功能测试')

test('构造函数初始化正确', () => {
  const layout = new ForceLayout({ width: 1000, height: 800 })
  assertEqual(layout.width, 1000)
  assertEqual(layout.height, 800)
  assert(layout.nodes instanceof Map)
  assert(Array.isArray(layout.edges))
  assert(layout.pinnedIds instanceof Set)
})

test('setData 正确创建节点', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  const services = [
    { id: 1, name: 'Service A' },
    { id: 2, name: 'Service B' }
  ]
  const deps = [{ id: 1, upstream_id: 1, downstream_id: 2 }]
  
  layout.setData(services, deps)
  
  assertEqual(layout.nodes.size, 2)
  assertEqual(layout.edges.length, 1)
  assert(layout.nodes.has(1))
  assert(layout.nodes.has(2))
  
  const node1 = layout.nodes.get(1)
  assertEqual(node1.id, 1)
  assertEqual(node1.name, 'Service A')
  assertEqual(node1.radius, 30)
})

test('setData 正确创建边', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  const services = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' },
    { id: 3, name: 'C' }
  ]
  const deps = [
    { id: 1, upstream_id: 1, downstream_id: 2 },
    { id: 2, upstream_id: 2, downstream_id: 3 }
  ]
  
  layout.setData(services, deps)
  assertEqual(layout.edges.length, 2)
  assertEqual(layout.edges[0].source, 1)
  assertEqual(layout.edges[0].target, 2)
})

console.log('\n2. 节点固定 (pinning) 测试')

test('fixNode 固定节点位置', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  const services = [{ id: 1, name: 'A' }]
  layout.setData(services, [])
  
  layout.fixNode(1, 100, 200)
  
  const node = layout.nodes.get(1)
  assertEqual(node.x, 100)
  assertEqual(node.y, 200)
  assertEqual(node.fx, 100)
  assertEqual(node.fy, 200)
  assert(layout.pinnedIds.has(1))
})

test('releaseNode 释放节点', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  const services = [{ id: 1, name: 'A' }]
  layout.setData(services, [])
  layout.fixNode(1, 100, 200)
  
  layout.releaseNode(1)
  
  const node = layout.nodes.get(1)
  assertEqual(node.fx, null)
  assertEqual(node.fy, null)
  assert(!layout.pinnedIds.has(1))
})

test('freezeAll 固定所有节点', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  const services = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' },
    { id: 3, name: 'C' }
  ]
  layout.setData(services, [])
  
  layout.freezeAll()
  
  assertEqual(layout.pinnedIds.size, 3)
  for (const node of layout.nodes.values()) {
    assert(node.fx !== null)
    assert(node.fy !== null)
  }
})

test('unfreezeAll 释放所有节点', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  const services = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' }
  ]
  layout.setData(services, [])
  layout.freezeAll()
  
  layout.unfreezeAll()
  
  assertEqual(layout.pinnedIds.size, 0)
  for (const node of layout.nodes.values()) {
    assertEqual(node.fx, null)
    assertEqual(node.fy, null)
  }
})

console.log('\n3. 位置保存与恢复测试')

test('setSavedPositions 设置保存的位置', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  const saved = { 1: { x: 123, y: 456 } }
  layout.setSavedPositions(saved)
  
  const services = [{ id: 1, name: 'A' }]
  layout.setData(services, [])
  
  const node = layout.nodes.get(1)
  assertEqual(node.x, 123)
  assertEqual(node.y, 456)
})

test('getPositions 获取所有节点位置', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  const services = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' }
  ]
  layout.setData(services, [])
  layout.fixNode(1, 100, 200)
  layout.fixNode(2, 300, 400)
  
  const positions = layout.getPositions()
  assertEqual(positions['1'].x, 100)
  assertEqual(positions['1'].y, 200)
  assertEqual(positions['2'].x, 300)
  assertEqual(positions['2'].y, 400)
})

test('setPinnedIds 批量设置固定节点', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  const services = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' },
    { id: 3, name: 'C' }
  ]
  layout.setData(services, [])
  
  layout.setPinnedIds([1, 3])
  
  assert(layout.pinnedIds.has(1))
  assert(!layout.pinnedIds.has(2))
  assert(layout.pinnedIds.has(3))
  assert(layout.nodes.get(1).fx !== null)
  assert(layout.nodes.get(2).fx === null)
  assert(layout.nodes.get(3).fx !== null)
})

test('getPinnedIds 获取固定节点列表', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  const services = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' }
  ]
  layout.setData(services, [])
  layout.fixNode(1, 100, 200)
  
  const pinned = layout.getPinnedIds()
  assert(Array.isArray(pinned))
  assertEqual(pinned.length, 1)
  assertEqual(pinned[0], 1)
})

console.log('\n4. 新增节点稳定性测试')

test('新增节点时，已有节点位置保持不变', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  
  const services1 = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' }
  ]
  layout.setData(services1, [])
  layout.fixNode(1, 100, 100)
  layout.fixNode(2, 300, 300)
  
  const pos1Before = { x: layout.nodes.get(1).x, y: layout.nodes.get(1).y }
  const pos2Before = { x: layout.nodes.get(2).x, y: layout.nodes.get(2).y }
  
  const services2 = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' },
    { id: 3, name: 'C' }
  ]
  layout.setData(services2, [])
  
  const node1 = layout.nodes.get(1)
  const node2 = layout.nodes.get(2)
  
  assertEqual(node1.x, pos1Before.x)
  assertEqual(node1.y, pos1Before.y)
  assertEqual(node2.x, pos2Before.x)
  assertEqual(node2.y, pos2Before.y)
  
  assert(node1.fx !== null)
  assert(node2.fx !== null)
})

test('autoFreezeOnStable 开启时，新增节点会固定已有节点', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: true })
  
  const services1 = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' }
  ]
  layout.setData(services1, [])
  
  const services2 = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' },
    { id: 3, name: 'C' }
  ]
  layout.setData(services2, [])
  
  assert(layout.nodes.get(1).fx !== null, '已有节点 1 应该被固定')
  assert(layout.nodes.get(2).fx !== null, '已有节点 2 应该被固定')
  assert(layout.nodes.get(3).fx === null, '新节点 3 不应该被固定')
  assert(layout.nodes.get(3).isNew === true, '新节点 3 应该标记为 isNew')
})

test('新节点在已有节点外围分布', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  
  const services1 = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' },
    { id: 3, name: 'C' }
  ]
  layout.setData(services1, [])
  layout.fixNode(1, 400, 300)
  layout.fixNode(2, 500, 300)
  layout.fixNode(3, 450, 400)
  
  const services2 = [...services1, { id: 4, name: 'D' }]
  layout.setData(services2, [])
  
  const newNode = layout.nodes.get(4)
  assert(newNode.x !== undefined)
  assert(newNode.y !== undefined)
  
  const centroid = { x: 450, y: 333 }
  const distFromCentroid = Math.sqrt(
    (newNode.x - centroid.x) ** 2 + (newNode.y - centroid.y) ** 2
  )
  assert(distFromCentroid > 50, `新节点应该在质心外，距离只有 ${distFromCentroid}`)
})

test('getNewNodeIds 获取新节点', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  
  const services1 = [{ id: 1, name: 'A' }]
  layout.setData(services1, [])
  
  const services2 = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' },
    { id: 3, name: 'C' }
  ]
  layout.setData(services2, [])
  
  const newIds = layout.getNewNodeIds()
  assertEqual(newIds.length, 2)
  assert(newIds.includes(2))
  assert(newIds.includes(3))
})

test('unfreezeNewNodes 只释放新节点', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  
  const services1 = [{ id: 1, name: 'A' }]
  layout.setData(services1, [])
  layout.fixNode(1, 100, 100)
  
  const services2 = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' }
  ]
  layout.setData(services2, [])
  
  layout.freezeAll()
  assert(layout.nodes.get(2).fx !== null)
  
  layout.unfreezeNewNodes()
  assert(layout.nodes.get(1).fx !== null, '已有节点应保持固定')
  assert(layout.nodes.get(2).fx === null, '新节点应被释放')
})

console.log('\n5. 力导向布局 step 测试')

test('step() 不移动固定节点', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  const services = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' }
  ]
  const deps = [{ id: 1, upstream_id: 1, downstream_id: 2 }]
  layout.setData(services, deps)
  
  layout.fixNode(1, 200, 300)
  
  for (let i = 0; i < 50; i++) {
    layout.step()
  }
  
  const node1 = layout.nodes.get(1)
  assertEqual(node1.x, 200)
  assertEqual(node1.y, 300)
})

test('step() 会移动未固定节点', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  const services = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' }
  ]
  layout.setData(services, [])
  
  layout.nodes.get(1).x = 200
  layout.nodes.get(1).y = 200
  layout.nodes.get(2).x = 210
  layout.nodes.get(2).y = 200
  
  const initialX = layout.nodes.get(2).x
  layout.fixNode(1, 200, 200)
  
  for (let i = 0; i < 10; i++) {
    layout.step()
  }
  
  const node2 = layout.nodes.get(2)
  assert(Math.abs(node2.x - initialX) > 1, '节点 2 应该因为斥力而移动')
})

test('布局最终会趋于稳定', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false, minVelocity: 0.01 })
  const services = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' },
    { id: 3, name: 'C' },
    { id: 4, name: 'D' }
  ]
  const deps = [
    { id: 1, upstream_id: 1, downstream_id: 2 },
    { id: 2, upstream_id: 2, downstream_id: 3 },
    { id: 3, upstream_id: 3, downstream_id: 4 }
  ]
  layout.setData(services, deps)
  
  let maxV = Infinity
  let stableSteps = 0
  let totalSteps = 0
  
  while (stableSteps < 50 && totalSteps < 2000) {
    maxV = layout.step()
    if (maxV < 0.1) {
      stableSteps++
    } else {
      stableSteps = 0
    }
    totalSteps++
  }
  
  assert(totalSteps < 2000, `布局应该在 2000 步内稳定，实际用了 ${totalSteps} 步`)
})

console.log('\n6. 循环依赖检测测试')

test('detectCycles 检测简单循环', () => {
  const deps = [
    { upstream_id: 1, downstream_id: 2 },
    { upstream_id: 2, downstream_id: 3 },
    { upstream_id: 3, downstream_id: 1 }
  ]
  const cycles = detectCycles(deps)
  assert(cycles.length > 0, '应该检测到循环')
  assert(cycles.some(c => c.length >= 3), '循环路径长度应 >= 3')
})

test('detectCycles 无环时返回空数组', () => {
  const deps = [
    { upstream_id: 1, downstream_id: 2 },
    { upstream_id: 2, downstream_id: 3 },
    { upstream_id: 1, downstream_id: 3 }
  ]
  const cycles = detectCycles(deps)
  assertEqual(cycles.length, 0)
})

test('detectCycles 自环检测', () => {
  const deps = [
    { upstream_id: 1, downstream_id: 2 },
    { upstream_id: 2, downstream_id: 2 }
  ]
  const cycles = detectCycles(deps)
  assert(cycles.length > 0, '自环也应该被检测到')
})

console.log('\n7. 影响范围分析测试')

test('getAffectedServices 分析直接影响', () => {
  const deps = [
    { upstream_id: 1, downstream_id: 2 },
    { upstream_id: 2, downstream_id: 3 },
    { upstream_id: 3, downstream_id: 4 }
  ]
  const result = getAffectedServices(deps, [2])
  assert(result.direct.has('3'), '服务 3 应该是直接受影响')
  assert(result.indirect.has('4'), '服务 4 应该是间接受影响')
  assert(!result.failed.has('3'), '服务 3 不是故障节点')
})

test('getAffectedServices 多个故障节点', () => {
  const deps = [
    { upstream_id: 1, downstream_id: 3 },
    { upstream_id: 2, downstream_id: 3 },
    { upstream_id: 3, downstream_id: 4 }
  ]
  const result = getAffectedServices(deps, [1, 2])
  assert(result.all.has('3'), '服务 3 应该受影响')
  assert(result.all.has('4'), '服务 4 应该受影响')
})

console.log('\n8. 几何查询测试')

test('getNodeAt 命中节点', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  const services = [{ id: 1, name: 'A' }]
  layout.setData(services, [])
  layout.fixNode(1, 100, 100)
  
  const node = layout.getNodeAt(100, 100)
  assert(node !== null)
  assertEqual(node.id, 1)
})

test('getNodeAt 未命中节点', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  const services = [{ id: 1, name: 'A' }]
  layout.setData(services, [])
  layout.fixNode(1, 100, 100)
  
  const node = layout.getNodeAt(500, 500)
  assertEqual(node, null)
})

test('getEdgeAt 命中边', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  const services = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' }
  ]
  const deps = [{ id: 1, upstream_id: 1, downstream_id: 2 }]
  layout.setData(services, deps)
  layout.fixNode(1, 100, 100)
  layout.fixNode(2, 300, 100)
  
  const edge = layout.getEdgeAt(200, 100, 10)
  assert(edge !== null)
  assertEqual(edge.source, 1)
  assertEqual(edge.target, 2)
})

console.log('\n9. 质心与扩散范围测试')

test('_getCentroid 计算正确质心', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  const services = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' }
  ]
  layout.setData(services, [])
  layout.fixNode(1, 0, 0)
  layout.fixNode(2, 100, 100)
  
  const centroid = layout._getCentroid()
  assertApprox(centroid.x, 50)
  assertApprox(centroid.y, 50)
})

test('_getSpread 计算正确扩散范围', () => {
  const layout = new ForceLayout({ width: 1000, height: 800, autoFreezeOnStable: false })
  const services = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' }
  ]
  layout.setData(services, [])
  layout.fixNode(1, 0, 0)
  layout.fixNode(2, 100, 0)
  
  const spread = layout._getSpread()
  assertApprox(spread.centroid.x, 50)
  assertApprox(spread.centroid.y, 0)
  assertApprox(spread.radius, 50)
})

console.log('\n=== 测试结果 ===')
console.log(`通过: ${passed}`)
console.log(`失败: ${failed}`)
console.log(`总计: ${passed + failed}`)

if (failed > 0) {
  process.exit(1)
}

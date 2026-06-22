const storage = require('./storage');

function buildAdjacencyList(dependencies) {
  const adjacency = new Map();
  const reverseAdjacency = new Map();
  for (const dep of dependencies) {
    if (!adjacency.has(dep.upstream_id)) adjacency.set(dep.upstream_id, []);
    if (!reverseAdjacency.has(dep.downstream_id)) reverseAdjacency.set(dep.downstream_id, []);
    adjacency.get(dep.upstream_id).push(dep.downstream_id);
    reverseAdjacency.get(dep.downstream_id).push(dep.upstream_id);
  }
  return { adjacency, reverseAdjacency };
}

function detectCycles(dependencies) {
  const { adjacency } = buildAdjacencyList(dependencies);
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  const cycles = [];
  const path = [];

  function dfs(node) {
    color.set(node, GRAY);
    path.push(node);
    const neighbors = adjacency.get(node) || [];
    for (const neighbor of neighbors) {
      const c = color.get(neighbor) || WHITE;
      if (c === GRAY) {
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart);
          cycle.push(neighbor);
          cycles.push([...cycle]);
        }
      } else if (c === WHITE) {
        dfs(neighbor);
      }
    }
    path.pop();
    color.set(node, BLACK);
  }

  const allNodes = new Set();
  for (const dep of dependencies) {
    allNodes.add(dep.upstream_id);
    allNodes.add(dep.downstream_id);
  }

  for (const node of allNodes) {
    if ((color.get(node) || WHITE) === WHITE) {
      dfs(node);
    }
  }

  return cycles;
}

function wouldCreateCycle(dependencies, newUpstream, newDownstream) {
  if (newUpstream === newDownstream) return true;
  const { reverseAdjacency } = buildAdjacencyList(dependencies);
  const visited = new Set();
  const stack = [newUpstream];

  while (stack.length > 0) {
    const node = stack.pop();
    if (node === newDownstream) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    const upstreams = reverseAdjacency.get(node) || [];
    for (const u of upstreams) {
      if (!visited.has(u)) stack.push(u);
    }
  }
  return false;
}

function getAffectedServices(dependencies, failedServiceIds) {
  const { adjacency } = buildAdjacencyList(dependencies);
  const affected = new Set();
  const direct = new Set();
  const queue = [...failedServiceIds];
  const level = new Map();

  for (const id of failedServiceIds) {
    affected.add(id);
    level.set(id, 0);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    const currentLevel = level.get(current) || 0;
    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      if (!affected.has(neighbor)) {
        affected.add(neighbor);
        level.set(neighbor, currentLevel + 1);
        if (currentLevel === 0) direct.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  const indirect = new Set();
  for (const id of affected) {
    if (!failedServiceIds.includes(id) && !direct.has(id)) {
      indirect.add(id);
    }
  }

  return {
    failed: new Set(failedServiceIds),
    direct,
    indirect,
    all: affected,
    levels: Object.fromEntries(level)
  };
}

function getDirectDownstream(dependencies, serviceId) {
  const result = [];
  for (const dep of dependencies) {
    if (dep.upstream_id === serviceId) result.push(dep.downstream_id);
  }
  return result;
}

function getDirectUpstream(dependencies, serviceId) {
  const result = [];
  for (const dep of dependencies) {
    if (dep.downstream_id === serviceId) result.push(dep.upstream_id);
  }
  return result;
}

function findCriticalPaths(dependencies, serviceId) {
  const { adjacency } = buildAdjacencyList(dependencies);
  const paths = [];
  const maxDepth = 10;

  function dfs(current, path, visited) {
    if (path.length > 1) {
      paths.push([...path]);
    }
    if (path.length > maxDepth) return;
    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        path.push(neighbor);
        dfs(neighbor, path, visited);
        path.pop();
        visited.delete(neighbor);
      }
    }
  }

  dfs(serviceId, [serviceId], new Set([serviceId]));
  paths.sort((a, b) => b.length - a.length);
  return paths.slice(0, 10);
}

function analyzeServiceImpact(dependencies, serviceId, services) {
  const serviceMap = new Map(services.map(s => [s.id, s]));
  const downstream = getDirectDownstream(dependencies, serviceId);
  const upstream = getDirectUpstream(dependencies, serviceId);
  const affected = getAffectedServices(dependencies, [serviceId]);
  const criticalPaths = findCriticalPaths(dependencies, serviceId);

  const enrich = (ids) => ids.map(id => serviceMap.get(id)).filter(Boolean);

  return {
    serviceId,
    directDownstream: enrich(downstream),
    directUpstream: enrich(upstream),
    directAffected: enrich([...affected.direct]),
    indirectAffected: enrich([...affected.indirect]),
    allAffected: enrich([...affected.all].filter(id => id !== serviceId)),
    affectedLevels: Object.fromEntries(
      Object.entries(affected.levels)
        .filter(([id]) => id !== String(serviceId))
        .map(([id, lvl]) => [id, lvl])
    ),
    criticalPaths: criticalPaths.map(path => path.map(id => serviceMap.get(id)).filter(Boolean)),
    maxImpactDepth: Math.max(0, ...Object.values(affected.levels))
  };
}

function getTopologyStats(dependencies, services) {
  const cycles = detectCycles(dependencies);
  const allAffectedIds = new Set();
  const failedIds = services
    .filter(s => s.summary?.status === 'down')
    .map(s => s.id);

  if (failedIds.length > 0) {
    const affected = getAffectedServices(dependencies, failedIds);
    affected.all.forEach(id => allAffectedIds.add(id));
  }

  const leafNodes = [];
  const rootNodes = [];
  const upstreamCount = new Map();
  const downstreamCount = new Map();

  for (const dep of dependencies) {
    downstreamCount.set(dep.upstream_id, (downstreamCount.get(dep.upstream_id) || 0) + 1);
    upstreamCount.set(dep.downstream_id, (upstreamCount.get(dep.downstream_id) || 0) + 1);
  }

  for (const svc of services) {
    if ((downstreamCount.get(svc.id) || 0) === 0) leafNodes.push(svc.id);
    if ((upstreamCount.get(svc.id) || 0) === 0) rootNodes.push(svc.id);
  }

  return {
    totalServices: services.length,
    totalDependencies: dependencies.length,
    cycles: cycles.length,
    cyclePaths: cycles,
    failedServices: failedIds,
    affectedServices: [...allAffectedIds],
    leafNodes,
    rootNodes
  };
}

module.exports = {
  buildAdjacencyList,
  detectCycles,
  wouldCreateCycle,
  getAffectedServices,
  getDirectDownstream,
  getDirectUpstream,
  findCriticalPaths,
  analyzeServiceImpact,
  getTopologyStats
};

const express = require('express');
const router = express.Router();
const storage = require('./storage');
const status = require('./status');
const scheduler = require('./scheduler');
const notifier = require('./notifier');
const topology = require('./topology');

router.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

router.get('/services', async (req, res) => {
  try {
    const services = await storage.services.getAll();
    const enriched = [];
    for (const svc of services) {
      enriched.push({
        ...svc,
        summary: await status.getServiceSummary(svc.id)
      });
    }
    res.json(enriched);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/services/:id', async (req, res) => {
  try {
    const svc = await storage.services.getById(req.params.id);
    if (!svc) return res.status(404).json({ error: 'Service not found' });
    res.json({
      ...svc,
      summary: await status.getServiceSummary(svc.id)
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/services', async (req, res) => {
  try {
    const data = req.body || {};
    if (!data.name || !data.type || !data.target) {
      return res.status(400).json({ error: 'name, type, target are required' });
    }
    if (!['http', 'https', 'tcp'].includes(data.type)) {
      return res.status(400).json({ error: 'type must be http, https, or tcp' });
    }
    if (data.type === 'tcp' && !data.port && !data.target.includes(':')) {
      return res.status(400).json({ error: 'tcp type requires port' });
    }
    const created = await storage.services.create(data);
    if (created.enabled) {
      scheduler.startServiceCheck(created);
    }
    notifier.notifyServiceUpdate(created.id, created);
    res.status(201).json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/services/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await storage.services.getById(id);
    if (!existing) return res.status(404).json({ error: 'Service not found' });

    const data = req.body || {};
    const allowed = ['name', 'type', 'target', 'port', 'method', 'expectedStatus', 'interval_seconds', 'timeout_ms', 'enabled'];
    const toUpdate = {};
    for (const key of allowed) {
      if (key in data) toUpdate[key] = data[key];
    }

    const updated = await storage.services.update(id, toUpdate);
    scheduler.restartServiceCheck(updated);
    notifier.notifyServiceUpdate(updated.id, updated);
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/services/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await storage.services.getById(id);
    if (!existing) return res.status(404).json({ error: 'Service not found' });
    scheduler.stopServiceCheck(id);
    await storage.services.remove(id);
    notifier.broadcast({ type: 'service_deleted', serviceId: id, timestamp: new Date().toISOString() });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/services/:id/check', async (req, res) => {
  try {
    const id = req.params.id;
    const svc = await storage.services.getById(id);
    if (!svc) return res.status(404).json({ error: 'Service not found' });
    scheduler.runCheck(svc);
    res.json({ ok: true, message: 'Check triggered' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/services/:id/trend', async (req, res) => {
  try {
    const id = req.params.id;
    const hours = parseInt(req.query.hours, 10) || 24;
    const svc = await storage.services.getById(id);
    if (!svc) return res.status(404).json({ error: 'Service not found' });
    const data = await status.getTrendData(id, hours);
    res.json({ serviceId: id, hours, data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/services/:id/results', async (req, res) => {
  try {
    const id = req.params.id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const svc = await storage.services.getById(id);
    if (!svc) return res.status(404).json({ error: 'Service not found' });
    const results = await storage.checkResults.getLatest(id, limit);
    res.json({ serviceId: id, results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/maintenance', async (req, res) => {
  try {
    res.json(await storage.maintenance.getAll());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/services/:id/maintenance', async (req, res) => {
  try {
    const id = req.params.id;
    res.json(await storage.maintenance.getAll(id));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/maintenance', async (req, res) => {
  try {
    const data = req.body || {};
    if (!data.name || !data.start_time || !data.end_time) {
      return res.status(400).json({ error: 'name, start_time, end_time are required' });
    }
    const created = await storage.maintenance.create(data);
    notifier.notifyMaintenanceChange(data.service_id || null, created);
    res.status(201).json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/maintenance/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body || {};
    const allowed = ['name', 'start_time', 'end_time', 'description', 'active', 'service_id'];
    const toUpdate = {};
    for (const key of allowed) {
      if (key in data) toUpdate[key] = data[key];
    }
    const updated = await storage.maintenance.update(id, toUpdate);
    notifier.notifyMaintenanceChange(updated.service_id, updated);
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/maintenance/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await storage.maintenance.remove(id);
    notifier.notifyMaintenanceChange(null, { id, deleted: true });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/maintenance/quick', async (req, res) => {
  try {
    const { service_id, minutes = 60, name, description } = req.body || {};
    if (!service_id) return res.status(400).json({ error: 'service_id is required' });
    const svc = await storage.services.getById(service_id);
    if (!svc) return res.status(404).json({ error: 'Service not found' });

    const now = new Date();
    const end = new Date(now.getTime() + minutes * 60 * 1000);
    const data = {
      service_id,
      name: name || `临时维护 - ${svc.name}`,
      description: description || `手动设置的维护窗口，时长${minutes}分钟`,
      start_time: now.toISOString(),
      end_time: end.toISOString(),
      active: 1
    };
    const created = await storage.maintenance.create(data);
    notifier.notifyMaintenanceChange(service_id, created);
    res.status(201).json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/status/summary', async (req, res) => {
  try {
    const services = await storage.services.getAll();
    let up = 0, down = 0, maintenance = 0, unknown = 0;
    const summaries = [];
    for (const svc of services) {
      const s = await status.getServiceSummary(svc.id);
      if (s.status === 'up') up++;
      else if (s.status === 'down') down++;
      else if (s.status === 'maintenance') maintenance++;
      else unknown++;
      summaries.push({ serviceId: svc.id, name: svc.name, type: svc.type, ...s });
    }

    res.json({
      total: services.length,
      counts: { up, down, maintenance, unknown },
      services: summaries
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/topology/dependencies', async (req, res) => {
  try {
    const dependencies = await storage.dependencies.getAll();
    res.json(dependencies);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/topology/stats', async (req, res) => {
  try {
    const dependencies = await storage.dependencies.getAll();
    const services = await storage.services.getAll();
    const enriched = [];
    for (const svc of services) {
      enriched.push({
        ...svc,
        summary: await status.getServiceSummary(svc.id)
      });
    }
    const stats = topology.getTopologyStats(dependencies, enriched);
    res.json(stats);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/topology/full', async (req, res) => {
  try {
    const dependencies = await storage.dependencies.getAll();
    const services = await storage.services.getAll();
    const enriched = [];
    for (const svc of services) {
      enriched.push({
        ...svc,
        summary: await status.getServiceSummary(svc.id)
      });
    }
    const stats = topology.getTopologyStats(dependencies, enriched);
    res.json({ services: enriched, dependencies, stats });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/topology/dependencies', async (req, res) => {
  try {
    const data = req.body || {};
    const upstreamId = parseInt(data.upstream_id, 10);
    const downstreamId = parseInt(data.downstream_id, 10);
    if (!upstreamId || !downstreamId) {
      return res.status(400).json({ error: 'upstream_id and downstream_id are required' });
    }
    if (upstreamId === downstreamId) {
      return res.status(400).json({ error: 'A service cannot depend on itself', cycle: true });
    }

    const upSvc = await storage.services.getById(upstreamId);
    const downSvc = await storage.services.getById(downstreamId);
    if (!upSvc || !downSvc) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const allDeps = await storage.dependencies.getAll();
    if (topology.wouldCreateCycle(allDeps, upstreamId, downstreamId)) {
      return res.status(400).json({
        error: 'This dependency would create a cycle',
        cycle: true
      });
    }

    const created = await storage.dependencies.create({
      upstream_id: upstreamId,
      downstream_id: downstreamId,
      description: data.description || ''
    });
    notifier.notifyTopologyChange('dependency_created', created);
    res.status(201).json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/topology/dependencies/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await storage.dependencies.getById(id);
    if (!existing) return res.status(404).json({ error: 'Dependency not found' });
    await storage.dependencies.remove(id);
    notifier.notifyTopologyChange('dependency_deleted', { id });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/topology/dependencies', async (req, res) => {
  try {
    const { upstream_id, downstream_id } = req.query;
    if (upstream_id && downstream_id) {
      await storage.dependencies.removeByPair(
        parseInt(upstream_id, 10),
        parseInt(downstream_id, 10)
      );
      notifier.notifyTopologyChange('dependency_deleted', {
        upstream_id: parseInt(upstream_id, 10),
        downstream_id: parseInt(downstream_id, 10)
      });
    } else {
      await storage.dependencies.clearAll();
      notifier.notifyTopologyChange('dependencies_cleared', {});
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/topology/dependencies/batch', async (req, res) => {
  try {
    const { items, mode = 'merge' } = req.body || {};
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items must be an array' });
    }
    if (!['merge', 'replace'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be "merge" or "replace"' });
    }

    const allDeps = await storage.dependencies.getAll();
    const validItems = [];
    const skipped = [];
    const baseDeps = mode === 'replace' ? [] : allDeps;

    for (const item of items) {
      const upId = parseInt(item.upstream_id, 10);
      const downId = parseInt(item.downstream_id, 10);
      if (!upId || !downId || upId === downId) {
        skipped.push({ ...item, reason: 'invalid_ids' });
        continue;
      }
      if (topology.wouldCreateCycle([...baseDeps, ...validItems], upId, downId)) {
        skipped.push({ ...item, reason: 'would_create_cycle' });
        continue;
      }
      validItems.push({
        upstream_id: upId,
        downstream_id: downId,
        description: item.description || ''
      });
    }

    let finalDeps;
    if (mode === 'replace') {
      finalDeps = validItems;
    } else {
      const existingPairs = new Set(allDeps.map(d => `${d.upstream_id}:${d.downstream_id}`));
      const newItems = validItems.filter(v => !existingPairs.has(`${v.upstream_id}:${v.downstream_id}`));
      finalDeps = [...allDeps, ...newItems];
    }

    const cycles = topology.detectCycles(finalDeps);
    if (cycles.length > 0) {
      return res.status(400).json({
        error: 'Import would create circular dependencies',
        cycle: true,
        cycles,
        skipped,
        total: items.length
      });
    }

    let backupDeps = null;
    if (mode === 'replace') {
      backupDeps = allDeps;
      await storage.dependencies.clearAll();
    }

    try {
      const imported = await storage.dependencies.bulkImport(validItems);
      const verifyDeps = await storage.dependencies.getAll();
      const verifyCycles = topology.detectCycles(verifyDeps);
      if (verifyCycles.length > 0) {
        if (mode === 'replace' && backupDeps) {
          await storage.dependencies.clearAll();
          await storage.dependencies.bulkImport(backupDeps);
        } else {
          for (const item of validItems) {
            await storage.dependencies.removeByPair(item.upstream_id, item.downstream_id);
          }
        }
        return res.status(400).json({
          error: 'Circular dependency detected during verification, import rolled back',
          cycle: true,
          cycles: verifyCycles,
          skipped,
          total: items.length
        });
      }
      notifier.notifyTopologyChange('batch_import', { count: imported.length, mode });
      res.json({ imported: imported.length, skipped, total: imported.length + skipped.length });
    } catch (importErr) {
      if (mode === 'replace' && backupDeps) {
        await storage.dependencies.clearAll();
        await storage.dependencies.bulkImport(backupDeps);
      }
      throw importErr;
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/topology/services/:id/impact', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const svc = await storage.services.getById(id);
    if (!svc) return res.status(404).json({ error: 'Service not found' });

    const dependencies = await storage.dependencies.getAll();
    const services = await storage.services.getAll();
    const enriched = [];
    for (const s of services) {
      enriched.push({
        ...s,
        summary: await status.getServiceSummary(s.id)
      });
    }
    const analysis = topology.analyzeServiceImpact(dependencies, id, enriched);
    res.json(analysis);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/topology/cycles', async (req, res) => {
  try {
    const dependencies = await storage.dependencies.getAll();
    const cycles = topology.detectCycles(dependencies);
    res.json({ hasCycles: cycles.length > 0, cycles });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

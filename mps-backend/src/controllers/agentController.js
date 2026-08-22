import * as svc from '../services/agentService.js';

// ── Admin-facing ──────────────────────────────────────────────────────────────

export async function createSite(req, res, next) {
  try {
    const site = await svc.createSite(req.body);
    res.status(201).json(site);
  } catch (err) { next(err); }
}

export async function listSites(req, res, next) {
  try {
    res.json(await svc.listSites());
  } catch (err) { next(err); }
}

export async function updateSite(req, res, next) {
  try {
    const site = await svc.updateSite(req.params.id, req.body);
    res.json(site);
  } catch (err) { next(err); }
}

export async function regenerateCode(req, res, next) {
  try {
    const site = await svc.regenerateCode(req.params.id);
    res.json(site);
  } catch (err) { next(err); }
}

// ── Agent-facing ──────────────────────────────────────────────────────────────

export async function register(req, res, next) {
  try {
    const result = await svc.register(req.body);
    res.json(result);
  } catch (err) { next(err); }
}

export async function getConfig(req, res, next) {
  try {
    res.json(await svc.getConfig(req.agentSite));
  } catch (err) { next(err); }
}

export async function heartbeat(req, res, next) {
  try {
    res.json(await svc.heartbeat(req.agentSite, req.body));
  } catch (err) { next(err); }
}

export async function receiveReadings(req, res, next) {
  try {
    const result = await svc.receiveReadings(req.agentSite, req.body.readings);
    res.json(result);
  } catch (err) { next(err); }
}

export async function receiveConsumables(req, res, next) {
  try {
    const result = await svc.receiveConsumables(req.agentSite, req.body.consumables);
    res.json(result);
  } catch (err) { next(err); }
}

export async function receiveAlerts(req, res, next) {
  try {
    const result = await svc.receiveAlerts(req.agentSite, req.body.alerts);
    res.json(result);
  } catch (err) { next(err); }
}

export async function getVersion(req, res, next) {
  try {
    res.json(svc.getLatestVersion());
  } catch (err) { next(err); }
}

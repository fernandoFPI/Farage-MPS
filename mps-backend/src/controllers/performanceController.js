import * as repo from '../repositories/performanceRepository.js';

function adminOrOdooFinance(req, res) {
  const role = req.user?.role;
  const allowed = role?.name === 'admin'
    || role?.name === 'odoo_integration'
    || role?.can_push_to_odoo;
  if (!allowed) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

export async function listEngineers(req, res, next) {
  try {
    if (!adminOrOdooFinance(req, res)) return;
    res.json(await repo.getEngineersSummary());
  } catch (err) { next(err); }
}

export async function getEngineer(req, res, next) {
  try {
    if (!adminOrOdooFinance(req, res)) return;
    const { cycleId, from, to } = req.query;
    const result = await repo.getEngineerDetail(req.params.id, { cycleId, from, to });
    if (!result) return res.status(404).json({ error: 'Engineer not found' });
    res.json(result);
  } catch (err) { next(err); }
}

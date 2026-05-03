import * as repo from '../repositories/performanceRepository.js';

function adminOnly(req, res) {
  if (req.user?.role?.name !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

export async function listEngineers(req, res, next) {
  try {
    if (!adminOnly(req, res)) return;
    res.json(await repo.getEngineersSummary());
  } catch (err) { next(err); }
}

export async function getEngineer(req, res, next) {
  try {
    if (!adminOnly(req, res)) return;
    const { cycleId, from, to } = req.query;
    const result = await repo.getEngineerDetail(req.params.id, { cycleId, from, to });
    if (!result) return res.status(404).json({ error: 'Engineer not found' });
    res.json(result);
  } catch (err) { next(err); }
}

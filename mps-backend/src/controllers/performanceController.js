import * as repo from '../repositories/performanceRepository.js';

export async function listEngineers(req, res, next) {
  try {
    const { from, to } = req.query;
    res.json(await repo.getEngineersSummary({ from, to }));
  } catch (err) { next(err); }
}

export async function getEngineer(req, res, next) {
  try {
    const { cycleId, from, to } = req.query;
    const result = await repo.getEngineerDetail(req.params.id, { cycleId, from, to });
    if (!result) return res.status(404).json({ error: 'Engineer not found' });
    res.json(result);
  } catch (err) { next(err); }
}

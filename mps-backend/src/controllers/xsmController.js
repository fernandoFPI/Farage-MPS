import * as service from '../services/xsmImportService.js';

export async function importFile(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const { periodStart, periodEnd } = req.body;
    if (!periodStart || !periodEnd) {
      return res.status(400).json({ error: 'periodStart and periodEnd are required' });
    }

    const result = await service.importXSMFile({
      buffer:      req.file.buffer,
      filename:    req.file.originalname,
      periodStart,
      periodEnd,
      userId:      req.user.id,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listLogs(req, res, next) {
  try {
    res.json(await service.getImportLogs(req.query));
  } catch (err) { next(err); }
}

export async function getLog(req, res, next) {
  try {
    res.json(await service.getImportLogById(req.params.id));
  } catch (err) { next(err); }
}

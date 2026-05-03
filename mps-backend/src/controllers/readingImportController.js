import * as service from '../services/readingImportService.js';

export async function importFile(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const result = await service.importReadingFile({
      buffer:   req.file.buffer,
      filename: req.file.originalname,
      userId:   req.user.id,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listLogs(req, res, next) {
  try {
    res.json(await service.getImportLogs());
  } catch (err) { next(err); }
}

export async function getLog(req, res, next) {
  try {
    res.json(await service.getImportLogById(req.params.id));
  } catch (err) { next(err); }
}

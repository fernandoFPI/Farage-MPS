import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import * as ctrl from '../controllers/readingImportController.js';

const router = Router();
const guard = [verifyToken, requirePermission('can_edit_billing')];

router.post('/',        ...guard, upload.single('file'), ctrl.importFile);
router.get('/logs',     ...guard, ctrl.listLogs);
router.get('/logs/:id', ...guard, ctrl.getLog);

export default router;

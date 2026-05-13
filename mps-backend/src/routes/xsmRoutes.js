import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { blockOdoo } from '../middleware/odooGuard.js';
import upload from '../middleware/upload.js';
import * as ctrl from '../controllers/xsmController.js';

const router = Router();
const guard  = [verifyToken, blockOdoo, requirePermission('can_manage_billing')];

router.post('/import',   ...guard, upload.single('file'), ctrl.importFile);
router.get('/logs',      ...guard, ctrl.listLogs);
router.get('/logs/:id',  ...guard, ctrl.getLog);

export default router;

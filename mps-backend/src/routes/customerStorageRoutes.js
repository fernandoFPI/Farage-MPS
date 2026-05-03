import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import * as ctrl from '../controllers/customerStorageController.js';

const router = Router();

router.get('/:customerId',                              verifyToken, ctrl.getByCustomer);
router.get('/:customerId/history/:printerModel',        verifyToken, ctrl.getHistory);
router.put('/:customerId/:printerModel',                verifyToken, requirePermission('can_submit_readings'), ctrl.update);

export default router;

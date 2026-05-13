import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { blockOdoo } from '../middleware/odooGuard.js';
import * as ctrl from '../controllers/customerStorageController.js';

const router = Router();

router.get('/:customerId',                              verifyToken, blockOdoo,                                          ctrl.getByCustomer);
router.get('/:customerId/history/:printerModel',        verifyToken, blockOdoo,                                          ctrl.getHistory);
router.put('/:customerId/:printerModel',                verifyToken, blockOdoo, requirePermission('can_submit_readings'), ctrl.update);

export default router;

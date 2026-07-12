import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { blockOdoo } from '../middleware/odooGuard.js';
import * as ctrl from '../controllers/consumableReadingController.js';

const router = Router();

router.get('/',    verifyToken, blockOdoo,                                          ctrl.list);
router.post('/',   verifyToken, blockOdoo, requirePermission('can_submit_readings'), ctrl.create);
router.get('/:id', verifyToken, blockOdoo,                                          ctrl.getById);
router.put('/:id', verifyToken, blockOdoo, requirePermission('can_edit_billing'),    ctrl.update);

export default router;

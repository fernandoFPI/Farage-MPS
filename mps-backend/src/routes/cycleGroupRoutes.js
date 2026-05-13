import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { blockOdoo } from '../middleware/odooGuard.js';
import * as ctrl from '../controllers/cycleGroupController.js';

const router = Router();
const manageBilling = [verifyToken, blockOdoo, requirePermission('can_manage_billing')];

router.get('/',       verifyToken, blockOdoo, ctrl.list);
router.post('/',      ...manageBilling,        ctrl.create);
router.get('/:id',    verifyToken, blockOdoo, ctrl.getById);
router.delete('/:id', verifyToken, blockOdoo, ctrl.remove);

export default router;

import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { blockOdoo } from '../middleware/odooGuard.js';
import * as ctrl from '../controllers/cycleGroupController.js';

const router = Router();
const manageBilling = [verifyToken, blockOdoo, requirePermission('can_edit_billing')];
const view = [verifyToken, blockOdoo, requirePermission('can_view_operational_data')];

router.get('/',       ...view,                 ctrl.list);
router.post('/',      ...manageBilling,        ctrl.create);
router.get('/:id',    ...view,                 ctrl.getById);
router.delete('/:id', ...manageBilling,        ctrl.remove);

export default router;

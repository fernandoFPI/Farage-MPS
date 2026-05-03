import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import * as ctrl from '../controllers/cycleGroupController.js';

const router = Router();
const manageBilling = [verifyToken, requirePermission('can_manage_billing')];

router.get('/',    verifyToken,       ctrl.list);
router.post('/',   ...manageBilling,  ctrl.create);
router.get('/:id', verifyToken,       ctrl.getById);
router.delete('/:id', verifyToken,    ctrl.remove);

export default router;

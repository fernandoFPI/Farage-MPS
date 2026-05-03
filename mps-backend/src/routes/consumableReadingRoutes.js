import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import * as ctrl from '../controllers/consumableReadingController.js';

const router = Router();

router.get('/',    verifyToken, ctrl.list);
router.post('/',   verifyToken, requirePermission('can_submit_readings'), ctrl.create);
router.get('/:id', verifyToken, ctrl.getById);
router.put('/:id', verifyToken, requirePermission('can_manage_billing'), ctrl.update);

export default router;

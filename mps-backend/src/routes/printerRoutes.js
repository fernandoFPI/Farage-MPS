import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import * as ctrl from '../controllers/printerController.js';

const router = Router();
const write   = [verifyToken, requirePermission('can_manage_contracts')];
const readSub = [verifyToken, requirePermission('can_submit_readings')];

router.get('/',                    verifyToken,   ctrl.list);
router.post('/',                   ...write,       ctrl.create);
router.get('/:id',                 verifyToken,   ctrl.getById);
router.put('/:id',                 ...write,       ctrl.update);
router.delete('/:id',              ...write,       ctrl.remove);
router.patch('/:id/coordinates',   ...readSub,     ctrl.updateCoordinates);

export default router;

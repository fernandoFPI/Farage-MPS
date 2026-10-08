import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { blockOdoo } from '../middleware/odooGuard.js';
import * as ctrl from '../controllers/printerController.js';

const router = Router();
const write   = [verifyToken, blockOdoo, requirePermission('can_edit_contracts')];
const readSub = [verifyToken, blockOdoo, requirePermission('can_submit_readings')];
const view    = [verifyToken, blockOdoo, requirePermission('can_view_operational_data')];

router.get('/',                    ...view,                  ctrl.list);
router.post('/',                   ...write,                 ctrl.create);
router.get('/:id',                 ...view,                  ctrl.getById);
router.put('/:id',                 ...write,                 ctrl.update);
router.delete('/:id',              ...write,                 ctrl.remove);
router.patch('/:id/coordinates',   ...readSub,               ctrl.updateCoordinates);

export default router;

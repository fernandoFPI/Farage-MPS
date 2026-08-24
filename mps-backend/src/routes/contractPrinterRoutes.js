import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { blockOdoo } from '../middleware/odooGuard.js';
import * as ctrl from '../controllers/contractPrinterController.js';

const router = Router();
const edit = [verifyToken, blockOdoo, requirePermission('can_edit_contracts')];

router.get('/',          verifyToken, blockOdoo,  ctrl.list);
router.post('/transfer', ...edit,                ctrl.transfer);
router.post('/',         ...edit,                ctrl.create);
router.put('/:id',       ...edit,                ctrl.update);
router.delete('/:id',    ...edit,                ctrl.remove);

export default router;

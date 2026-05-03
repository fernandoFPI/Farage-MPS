import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import * as ctrl from '../controllers/contractPrinterController.js';

const router = Router();
const write = [verifyToken, requirePermission('can_manage_contracts')];

router.get('/',       verifyToken,  ctrl.list);
router.post('/',      ...write,     ctrl.create);
router.put('/:id',    ...write,     ctrl.update);
router.delete('/:id', ...write,     ctrl.remove);

export default router;

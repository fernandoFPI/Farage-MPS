import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { blockOdoo } from '../middleware/odooGuard.js';
import * as ctrl from '../controllers/contractController.js';

const router = Router();
const write = [verifyToken, blockOdoo, requirePermission('can_manage_contracts')];

router.get('/',       verifyToken, blockOdoo,  ctrl.list);
router.post('/',      ...write,                ctrl.create);
router.get('/:id',    verifyToken, blockOdoo,  ctrl.getById);
router.put('/:id',    ...write,                ctrl.update);
router.delete('/:id', ...write,                ctrl.remove);

export default router;

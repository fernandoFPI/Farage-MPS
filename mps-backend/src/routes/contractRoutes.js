import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { blockOdoo } from '../middleware/odooGuard.js';
import * as ctrl from '../controllers/contractController.js';

const router = Router();
const create = [verifyToken, blockOdoo, requirePermission('can_create_contracts')];
const edit   = [verifyToken, blockOdoo, requirePermission('can_edit_contracts')];
const del    = [verifyToken, blockOdoo, requirePermission('can_delete_contracts')];

const view = [verifyToken, blockOdoo, requirePermission('can_view_operational_data')];

router.get('/',       ...view,                ctrl.list);
router.post('/',      ...create,               ctrl.create);
router.get('/:id',    ...view,                ctrl.getById);
router.put('/:id',    ...edit,                 ctrl.update);
router.delete('/:id', ...del,                  ctrl.remove);

export default router;

import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { blockOdoo } from '../middleware/odooGuard.js';
import * as userController from '../controllers/userController.js';

const router = Router();

const guard = [verifyToken, blockOdoo, requirePermission('can_manage_users')];

router.get('/', ...guard, userController.list);
router.post('/', ...guard, userController.create);
router.get('/:id', ...guard, userController.getById);
router.put('/:id', ...guard, userController.update);
router.delete('/:id', ...guard, userController.deactivate);

export default router;

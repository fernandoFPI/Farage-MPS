import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import * as roleController from '../controllers/roleController.js';

const router = Router();
const manage = [verifyToken, requirePermission('can_manage_users')];

router.get('/', verifyToken, requirePermission('can_view_users'), roleController.getAll);
router.post('/', ...manage, roleController.create);
router.put('/:id', ...manage, roleController.update);
router.delete('/:id', ...manage, roleController.remove);

export default router;

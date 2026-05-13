import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { blockOdoo } from '../middleware/odooGuard.js';
import * as ctrl from '../controllers/meterReadingController.js';

const router = Router();

router.get('/previous',   verifyToken, blockOdoo,                                           ctrl.getPrevious);
router.get('/',           verifyToken, blockOdoo,                                           ctrl.list);
router.post('/',          verifyToken, blockOdoo, requirePermission('can_submit_readings'), ctrl.create);
router.get('/:id/photos', verifyToken, blockOdoo,                                           ctrl.getPhotos);
router.get('/:id',        verifyToken, blockOdoo,                                           ctrl.getById);
router.put('/:id',        verifyToken, blockOdoo, requirePermission('can_submit_readings'), ctrl.update);
router.delete('/:id',     verifyToken, blockOdoo, requirePermission('can_manage_billing'),  ctrl.remove);

export default router;

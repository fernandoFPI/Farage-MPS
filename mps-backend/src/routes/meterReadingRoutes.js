import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import * as ctrl from '../controllers/meterReadingController.js';

const router = Router();

router.get('/previous', verifyToken, ctrl.getPrevious);
router.get('/',       verifyToken,                                           ctrl.list);
router.post('/',      verifyToken, requirePermission('can_submit_readings'), ctrl.create);
router.get('/:id/photos', verifyToken, ctrl.getPhotos);
router.get('/:id',    verifyToken,                                           ctrl.getById);
router.put('/:id',    verifyToken, requirePermission('can_submit_readings'), ctrl.update);
router.delete('/:id', verifyToken, requirePermission('can_manage_billing'),  ctrl.remove);

export default router;

import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { blockOdoo } from '../middleware/odooGuard.js';
import * as ctrl from '../controllers/meterReadingController.js';

const router = Router();

router.get('/previous',   verifyToken, blockOdoo, requirePermission('can_view_operational_data'), ctrl.getPrevious);
router.delete('/bulk',    verifyToken, blockOdoo, requirePermission('can_edit_billing'),          ctrl.bulkDelete);
router.get('/',           verifyToken, blockOdoo, requirePermission('can_view_operational_data'), ctrl.list);
router.post('/',          verifyToken, blockOdoo, requirePermission('can_submit_readings'),       ctrl.create);
router.get('/:id/photos',               verifyToken, blockOdoo, requirePermission('can_view_operational_data'), ctrl.getPhotos);
router.post('/:id/photos',              verifyToken, blockOdoo, requirePermission('can_submit_readings'),       ctrl.addPhoto);
router.delete('/:id/photos/:photoId',   verifyToken, blockOdoo, requirePermission('can_submit_readings'),       ctrl.deletePhoto);
router.get('/:id',        verifyToken, blockOdoo, requirePermission('can_view_operational_data'), ctrl.getById);
router.put('/:id',        verifyToken, blockOdoo, requirePermission('can_submit_readings'), ctrl.update);
router.delete('/:id',     verifyToken, blockOdoo, requirePermission('can_edit_billing'),    ctrl.remove);

export default router;

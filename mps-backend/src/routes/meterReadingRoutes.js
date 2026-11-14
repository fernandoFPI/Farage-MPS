import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { blockOdoo } from '../middleware/odooGuard.js';
import * as ctrl from '../controllers/meterReadingController.js';

const router = Router();

// Engineers must submit through a ticket (consumables + stock required, drafts
// supported). Admins, specialists and the import flows keep using this route.
function blockEngineerDirectSubmit(req, res, next) {
  if (req.user?.role?.name === 'engineer') {
    return res.status(403).json({
      error: 'Engineers must submit readings through a ticket (consumable levels and stock are required)',
    });
  }
  next();
}

router.get('/previous',   verifyToken, blockOdoo, requirePermission('can_view_operational_data'), ctrl.getPrevious);
router.delete('/bulk',    verifyToken, blockOdoo, requirePermission('can_edit_billing'),          ctrl.bulkDelete);
router.get('/',           verifyToken, blockOdoo, requirePermission('can_view_operational_data'), ctrl.list);
router.post('/',          verifyToken, blockOdoo, requirePermission('can_submit_readings'), blockEngineerDirectSubmit, ctrl.create);
router.get('/:id/photos',               verifyToken, blockOdoo, requirePermission('can_view_operational_data'), ctrl.getPhotos);
router.post('/:id/photos',              verifyToken, blockOdoo, requirePermission('can_submit_readings'),       ctrl.addPhoto);
router.delete('/:id/photos/:photoId',   verifyToken, blockOdoo, requirePermission('can_submit_readings'),       ctrl.deletePhoto);
router.get('/:id',        verifyToken, blockOdoo, requirePermission('can_view_operational_data'), ctrl.getById);
router.put('/:id',        verifyToken, blockOdoo, requirePermission('can_submit_readings'), ctrl.update);
router.delete('/:id',     verifyToken, blockOdoo, requirePermission('can_edit_billing'),    ctrl.remove);

export default router;

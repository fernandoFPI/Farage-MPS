import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { blockOdoo } from '../middleware/odooGuard.js';
import * as ctrl from '../controllers/ticketController.js';

const router = Router();
const guard = [verifyToken, blockOdoo, requirePermission('can_submit_readings')];

router.get('/context',                              ...guard, ctrl.context);
router.post('/submit',                              ...guard, ctrl.submit);
router.put('/drafts',                               ...guard, ctrl.saveDraft);
router.get('/drafts/:billingCycleId/:printerId',    ...guard, ctrl.getDraft);
router.delete('/drafts/:billingCycleId/:printerId', ...guard, ctrl.deleteDraft);

export default router;

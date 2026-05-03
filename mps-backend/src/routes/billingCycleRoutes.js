import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import * as ctrl from '../controllers/billingCycleController.js';

const router = Router();
const manageBilling  = [verifyToken, requirePermission('can_manage_billing')];
const confirmBilling = [verifyToken, requirePermission('can_confirm_billing')];
const submitReadings = [verifyToken, requirePermission('can_submit_readings')];

router.get('/',              verifyToken,      ctrl.list);
router.post('/',             ...manageBilling,  ctrl.create);
router.get('/:id',           verifyToken,      ctrl.getById);
router.get('/:id/summary',       verifyToken,      ctrl.summary);
router.get('/:id/group-summary', verifyToken,      ctrl.groupSummary);
router.patch('/:id/confirm', ...confirmBilling, ctrl.confirm);
router.patch('/:id/dispute', ...confirmBilling, ctrl.dispute);
router.patch('/:id/reopen',  ...manageBilling,  ctrl.reopen);
router.delete('/:id',                         verifyToken,       ctrl.cancel);
router.patch('/:id/set-baseline',             verifyToken,       ctrl.setBaseline);
router.post('/:id/lock-printer',              ...submitReadings,  ctrl.lockPrinter);
router.delete('/:id/lock-printer/:printerId', ...submitReadings,  ctrl.unlockPrinter);

export default router;

import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { blockOdoo, requireOdooOrFinance } from '../middleware/odooGuard.js';
import { odooRateLimit } from '../middleware/rateLimiter.js';
import * as ctrl from '../controllers/billingCycleController.js';
import * as cityCtrl from '../controllers/cityCycleStatusController.js';

const router = Router();
const manageBilling  = [verifyToken, blockOdoo, requirePermission('can_manage_billing')];
const confirmBilling = [verifyToken, blockOdoo, requirePermission('can_confirm_billing')];
const submitReadings = [verifyToken, blockOdoo, requirePermission('can_submit_readings')];
const requireAdmin   = [verifyToken, blockOdoo, (req, res, next) => req.user?.role?.name === 'admin' ? next() : res.status(403).json({ error: 'Admin only' })];

// Odoo-accessible routes (no blockOdoo, rate-limited)
router.get('/',              verifyToken, odooRateLimit, ctrl.list);
router.get('/:id/summary',   verifyToken, odooRateLimit, ctrl.summary);
router.post('/:id/mark-invoiced', verifyToken, odooRateLimit, requireOdooOrFinance, ctrl.markInvoiced);

// Admin-only routes (must be before /:id)
router.get('/cancelled',     ...requireAdmin,   ctrl.listCancelled);
router.get('/deleted',       ...requireAdmin,   ctrl.listDeleted);
router.delete('/:id/purge',  ...requireAdmin,   ctrl.hardDelete);
router.post('/:id/restore',  ...requireAdmin,   ctrl.restoreCycle);

// Standard routes blocked for Odoo
router.post('/',             ...manageBilling,  ctrl.create);
router.get('/:id',           verifyToken, odooRateLimit, ctrl.getById);
router.patch('/:id/confirm', ...confirmBilling, ctrl.confirm);
router.patch('/:id/dispute', ...confirmBilling, ctrl.dispute);
router.patch('/:id/reopen',  ...manageBilling,  ctrl.reopen);
router.delete('/:id',        verifyToken, blockOdoo, ctrl.cancel);
router.get('/:id/group-summary', verifyToken, blockOdoo, ctrl.groupSummary);
router.patch('/:id/set-baseline',             verifyToken, blockOdoo,       ctrl.setBaseline);
router.post('/:id/lock-printer',              ...submitReadings,             ctrl.lockPrinter);
router.delete('/:id/lock-printer/:printerId', ...submitReadings,             ctrl.unlockPrinter);
router.patch('/:id/submit-storage',           ...submitReadings,             ctrl.submitStorage);
router.patch('/:id/reset-storage',            ...manageBilling,              ctrl.resetStorageSubmission);

// City status routes
router.get('/:id/cities',                     ...manageBilling,   cityCtrl.list);
router.patch('/:id/cities/:city/confirm',     ...confirmBilling,  cityCtrl.confirm);
router.patch('/:id/cities/:city/reset',       ...manageBilling,   cityCtrl.reset);

export default router;

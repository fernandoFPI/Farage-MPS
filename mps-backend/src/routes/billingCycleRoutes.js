import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { blockOdoo, requireOdooOrFinance } from '../middleware/odooGuard.js';
import { odooRateLimit } from '../middleware/rateLimiter.js';
import * as ctrl from '../controllers/billingCycleController.js';
import * as cityCtrl from '../controllers/cityCycleStatusController.js';

const router = Router();
const manageBilling  = [verifyToken, blockOdoo, requirePermission('can_edit_billing')];
const confirmBilling = [verifyToken, blockOdoo, requirePermission('can_confirm_billing')];
const submitReadings = [verifyToken, blockOdoo, requirePermission('can_submit_readings')];
const requireAdmin   = [verifyToken, blockOdoo, (req, res, next) => req.user?.role?.name === 'admin' ? next() : res.status(403).json({ error: 'Admin only' })];

// Odoo-accessible routes (no blockOdoo)
// NOTE: list/summary/getById below are core UI reads hit on every cycle page
// view — they are NOT the endpoints Odoo's connector actually polls, so they
// must not carry the Odoo-integration rate limit (that was throttling every
// user in the app, not just the Odoo service account).
router.get('/',                    verifyToken, requirePermission('can_view_billing'), ctrl.list);
router.get('/:id/summary',         verifyToken, requirePermission('can_view_billing'), ctrl.summary);
router.get('/:id/odoo-export',     verifyToken, odooRateLimit, requireOdooOrFinance, ctrl.getOdooExport);
router.get('/:id/audit-export',    verifyToken, blockOdoo, requirePermission('can_view_billing_breakdown'), ctrl.getAuditExport);
router.post('/:id/mark-invoiced',  verifyToken, odooRateLimit, requireOdooOrFinance, ctrl.markInvoiced);

// Admin-only routes (must be before /:id)
router.get('/cancelled',     ...requireAdmin,   ctrl.listCancelled);
router.get('/deleted',       ...requireAdmin,   ctrl.listDeleted);
router.get('/latest',        ...manageBilling,  ctrl.getLatestCycle);
router.delete('/:id/purge',  ...requireAdmin,   ctrl.hardDelete);
router.post('/:id/restore',  ...requireAdmin,   ctrl.restoreCycle);

// Cycle locks — admin only. A locked cycle serves a frozen snapshot of its figures; unlocking
// and recalculating are the only ways it changes. Bulk routes first (they are not /:id routes).
router.get('/locks/candidates',       ...requireAdmin, ctrl.countLockCandidates);
router.post('/locks/bulk',            ...requireAdmin, ctrl.lockCyclesBulk);
router.post('/:id/lock',              ...requireAdmin, ctrl.lockCycle);
router.post('/:id/unlock',            ...requireAdmin, ctrl.unlockCycle);
router.get('/:id/recalculate-preview', ...requireAdmin, ctrl.previewRecalculation);
router.post('/:id/recalculate',       ...requireAdmin, ctrl.recalculateCycle);
router.get('/:id/lock-history',       ...requireAdmin, ctrl.getLockHistory);

// Standard routes blocked for Odoo
router.post('/',             ...manageBilling,  ctrl.create);
router.get('/:id',           verifyToken, requirePermission('can_view_billing'), ctrl.getById);
router.patch('/:id/confirm',   ...confirmBilling, ctrl.confirm);
router.patch('/:id/dispute',   ...confirmBilling, ctrl.dispute);
router.patch('/:id/reopen',    ...manageBilling,  ctrl.reopen);
router.patch('/:id/unconfirm', ...requireAdmin,   ctrl.unconfirm)
router.patch('/:id/period',    ...requireAdmin,   ctrl.updatePeriod);
router.delete('/:id',        verifyToken, blockOdoo, ctrl.cancel);
router.get('/:id/group-summary', verifyToken, blockOdoo, requirePermission('can_view_billing_totals'), ctrl.groupSummary);
router.patch('/:id/set-baseline',             verifyToken, blockOdoo,       ctrl.setBaseline);
router.patch('/:id/manual-billing',           ...requireAdmin,               ctrl.setManualBillingAmount);
router.post('/:id/lock-printer',              ...submitReadings,             ctrl.lockPrinter);
router.delete('/:id/lock-printer/:printerId', ...submitReadings,             ctrl.unlockPrinter);
router.patch('/:id/submit-storage',           ...submitReadings,             ctrl.submitStorage);
router.patch('/:id/reset-storage',            ...manageBilling,              ctrl.resetStorageSubmission);

// Stock review (confirm / adjust / acknowledge anomalies) needs can_review_stock; reading it needs the
// same access as the customer stock tab. The activity log is part of the cycle view.
const reviewStock = [verifyToken, blockOdoo, requirePermission('can_review_stock')];
router.get('/:id/stock-review',                         verifyToken, blockOdoo, requirePermission('can_view_operational_data'), ctrl.getStockReview);
router.post('/:id/stock-review/confirm',                ...reviewStock, ctrl.confirmStock);
router.post('/:id/stock-review',                        ...reviewStock, ctrl.addStock);
router.patch('/:id/stock-review/:historyId',            ...reviewStock, ctrl.adjustStock);
router.post('/:id/stock-review/:historyId/acknowledge', ...reviewStock, ctrl.acknowledgeStockAnomaly);
router.get('/:id/activity',                             verifyToken, blockOdoo, requirePermission('can_view_billing'), ctrl.getActivity);

// City status routes
router.get('/:id/cities',                     ...manageBilling,   cityCtrl.list);
router.patch('/:id/cities/:city/confirm',     ...confirmBilling,  cityCtrl.confirm);
router.patch('/:id/cities/:city/reset',       ...manageBilling,   cityCtrl.reset);

export default router;

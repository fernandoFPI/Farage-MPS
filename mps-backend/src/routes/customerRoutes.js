import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { blockOdoo } from '../middleware/odooGuard.js';
import { odooRateLimit } from '../middleware/rateLimiter.js';
import * as ctrl from '../controllers/customerController.js';

const router = Router();
const write = [verifyToken, blockOdoo, requirePermission('can_manage_contracts')];

// Odoo can only fetch a single customer (for partner_id lookup)
router.get('/:id',    verifyToken, odooRateLimit, ctrl.getById);

// All other endpoints blocked for Odoo
router.get('/',       verifyToken, blockOdoo, odooRateLimit, ctrl.list);
router.post('/',      ...write,                              ctrl.create);
router.put('/:id',    ...write,                              ctrl.update);
router.delete('/:id', ...write,                              ctrl.remove);

export default router;

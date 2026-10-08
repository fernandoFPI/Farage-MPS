import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import { odooRateLimit } from '../middleware/rateLimiter.js';
import * as ctrl from '../controllers/performanceController.js';

const router = Router();

router.get('/engineers',     verifyToken, odooRateLimit, requirePermission('can_view_performance'), ctrl.listEngineers);
router.get('/engineers/:id', verifyToken, odooRateLimit, requirePermission('can_view_performance'), ctrl.getEngineer);

export default router;

import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { requireOdooOrFinance } from '../middleware/odooGuard.js';
import { odooRateLimit } from '../middleware/rateLimiter.js';
import * as ctrl from '../controllers/performanceController.js';

const router = Router();

router.get('/engineers',     verifyToken, odooRateLimit, requireOdooOrFinance, ctrl.listEngineers);
router.get('/engineers/:id', verifyToken, odooRateLimit, requireOdooOrFinance, ctrl.getEngineer);

export default router;

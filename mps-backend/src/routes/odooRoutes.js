import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { requireOdooOrFinance } from '../middleware/odooGuard.js';
import { odooRateLimit } from '../middleware/rateLimiter.js';
import * as ctrl from '../controllers/odooController.js';

const router = Router();

router.post('/callback', verifyToken, odooRateLimit, requireOdooOrFinance, ctrl.handleCallback);

export default router;

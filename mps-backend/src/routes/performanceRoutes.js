import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { blockOdoo } from '../middleware/odooGuard.js';
import * as ctrl from '../controllers/performanceController.js';

const router = Router();

router.get('/engineers',     verifyToken, blockOdoo, ctrl.listEngineers);
router.get('/engineers/:id', verifyToken, blockOdoo, ctrl.getEngineer);

export default router;

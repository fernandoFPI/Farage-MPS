import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import * as ctrl from '../controllers/performanceController.js';

const router = Router();

router.get('/engineers',     verifyToken, ctrl.listEngineers);
router.get('/engineers/:id', verifyToken, ctrl.getEngineer);

export default router;

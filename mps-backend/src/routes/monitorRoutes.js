import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { blockOdoo } from '../middleware/odooGuard.js';
import * as ctrl from '../controllers/monitorController.js';

function requireMonitorAccess(req, res, next) {
  const role = req.user?.role?.name;
  const allowed = ['admin', 'mps_team_lead', 'mps_specialist', 'service_manager'];
  if (!allowed.includes(role)) return res.status(403).json({ error: 'Forbidden' });
  next();
}

const guard = [verifyToken, blockOdoo, requireMonitorAccess];
const router = Router();

router.get('/summary',       ...guard, ctrl.getSummary);
router.get('/reading-gaps',  ...guard, ctrl.getReadingGaps);
router.get('/cycle-gaps',    ...guard, ctrl.getCycleGaps);
router.get('/odoo-status',   ...guard, ctrl.getOdooStatus);

export default router;

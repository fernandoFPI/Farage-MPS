import { Router } from 'express';
import { verifyAgentToken } from '../middleware/agentAuth.js';
import { verifyToken } from '../middleware/auth.js';
import * as ctrl from '../controllers/agentController.js';

function requireAdmin(req, res, next) {
  if (req.user?.role?.name !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

const router = Router();

// ── Public (no token) ─────────────────────────────────────────────────────────
router.post('/register', ctrl.register);
router.get('/version',   ctrl.getVersion);

// ── Authenticated agent routes ────────────────────────────────────────────────
router.use(verifyAgentToken);
router.get('/config',              ctrl.getConfig);
router.post('/heartbeat',          ctrl.heartbeat);
router.post('/readings',           ctrl.receiveReadings);
router.post('/consumables',        ctrl.receiveConsumables);
router.post('/alerts',             ctrl.receiveAlerts);

// ── Admin routes (mounted separately at /api/admin/agent-sites) ───────────────
export const adminRouter = Router();
adminRouter.use(verifyToken, requireAdmin);
adminRouter.get('/',                ctrl.listSites);
adminRouter.post('/',               ctrl.createSite);
adminRouter.patch('/:id',           ctrl.updateSite);
adminRouter.post('/:id/regen-code', ctrl.regenerateCode);

export default router;

import { Router } from 'express'
import { verifyToken } from '../middleware/auth.js'
import { blockOdoo } from '../middleware/odooGuard.js'
import * as controller from '../controllers/analyticsController.js'

function requireAnalyticsAccess(req, res, next) {
  const role = req.user?.role?.name
  if (role !== 'admin' && role !== 'mps_team_lead' && role !== 'mps_specialist') {
    return res.status(403).json({ error: 'Forbidden' })
  }
  next()
}

const router = Router()

router.get('/', verifyToken, blockOdoo, requireAnalyticsAccess, controller.get)

export default router

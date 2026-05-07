import { Router } from 'express'
import { verifyToken } from '../middleware/auth.js'
import * as controller from '../controllers/systemSettingsController.js'

function requireAdmin(req, res, next) {
  if (req.user?.role?.name !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }
  next()
}

const router = Router()

router.get('/', verifyToken, controller.list)
router.patch('/:key', verifyToken, requireAdmin, controller.update)

export default router

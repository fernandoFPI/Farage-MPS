import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { loginRateLimit } from '../middleware/rateLimiter.js';
import * as authController from '../controllers/authController.js';

const router = Router();

router.post('/login', loginRateLimit, authController.login);
router.get('/me', verifyToken, authController.me);

export default router;

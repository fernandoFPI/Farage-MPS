import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import * as authController from '../controllers/authController.js';

const router = Router();

router.post('/login', authController.login);
router.get('/me', verifyToken, authController.me);

export default router;

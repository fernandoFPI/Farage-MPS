import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import * as roleController from '../controllers/roleController.js';

const router = Router();

router.get('/', verifyToken, roleController.getAll);

export default router;

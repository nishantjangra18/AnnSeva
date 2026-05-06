import { Router } from 'express';
import { me, updateProfile } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.use(requireAuth);
router.get('/', me);
router.put('/', updateProfile);

export default router;

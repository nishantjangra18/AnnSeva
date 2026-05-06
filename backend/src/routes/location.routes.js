import { Router } from 'express';
import { location } from '../controllers/listing.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.use(requireAuth);
router.post('/:id', location);

export default router;

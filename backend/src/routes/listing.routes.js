import { Router } from 'express';
import {
  collectorAccept,
  create,
  delivery,
  driverAccept,
  index,
  location,
  pickup,
  rate,
  remove
} from '../controllers/listing.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.use(requireAuth);
router.get('/', index);
router.post('/', create);
router.post('/:id/accept-collector', collectorAccept);
router.post('/:id/accept-driver', driverAccept);
router.post('/:id/pickup', pickup);
router.post('/:id/delivery', delivery);
router.post('/:id/rate', rate);
router.post('/:id/location', location);
router.post('/:id/cancel', remove);
router.delete('/:id', remove);

export default router;

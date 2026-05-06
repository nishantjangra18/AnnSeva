import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.routes.js';
import listingRoutes from './routes/listing.routes.js';
import locationRoutes from './routes/location.routes.js';
import profileRoutes from './routes/profile.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { corsOrigins } from './config/cors.js';

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: corsOrigins(), credentials: true }));
  app.use(express.json({ limit: '8mb' }));
  app.use('/uploads', express.static('uploads'));
  app.use(morgan('dev'));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 600 }));

  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'annseva-api' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/listings', listingRoutes);
  app.use('/api/locations', locationRoutes);

  app.use(errorHandler);
  return app;
}

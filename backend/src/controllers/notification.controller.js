import { AppError } from '../utils/AppError.js';
import { listNotifications, markNotificationRead } from '../services/notification.service.js';

export async function index(req, res, next) {
  try {
    const notifications = await listNotifications(req.user);
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req, res, next) {
  try {
    const notification = await markNotificationRead(req.user, req.params.id);
    if (!notification) throw new AppError('Notification not found', 404);
    res.json({ notification });
  } catch (err) {
    next(err);
  }
}

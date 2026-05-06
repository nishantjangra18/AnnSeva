import { Notification } from '../models/Notification.js';

export async function createNotification({ userId, listingId, message, type }) {
  if (!userId) return null;
  return Notification.create({ userId, listingId, message, type });
}

export async function listNotifications(user) {
  return Notification.find({ userId: user._id }).sort({ createdAt: -1 }).limit(30);
}

export async function markNotificationRead(user, id) {
  return Notification.findOneAndUpdate(
    { _id: id, userId: user._id },
    { read: true },
    { new: true }
  );
}

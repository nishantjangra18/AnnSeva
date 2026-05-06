import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new AppError('Authentication required', 401);

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select('-passwordHash');
    if (!user) throw new AppError('User not found', 401);

    req.user = user;
    next();
  } catch (err) {
    next(err.statusCode ? err : new AppError('Invalid or expired token', 401));
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You are not allowed to perform this action', 403));
    }
    next();
  };
}

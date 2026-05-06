import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { AppError } from '../utils/AppError.js';

export function createOtp() {
  return String(crypto.randomInt(100000, 999999));
}

export async function hashOtp(otp) {
  return bcrypt.hash(otp, 10);
}

export async function verifyOtp(plain, hash) {
  if (!plain || !hash) throw new AppError('OTP is required', 400);
  const valid = await bcrypt.compare(String(plain), hash);
  if (!valid) throw new AppError('Invalid OTP', 422);
}

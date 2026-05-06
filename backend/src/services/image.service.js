import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { AppError } from '../utils/AppError.js';

const allowedMimeTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

export async function saveImageData(imageData) {
  if (!imageData) return '';

  const match = String(imageData).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new AppError('Food image must be a JPG, PNG, or WEBP file', 400);

  const [, mimeType, base64] = match;
  const extension = allowedMimeTypes.get(mimeType);
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > 5 * 1024 * 1024) throw new AppError('Food image must be 5MB or smaller', 413);

  const uploadsDir = path.join(process.cwd(), 'uploads');
  await fs.mkdir(uploadsDir, { recursive: true });

  const fileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
  await fs.writeFile(path.join(uploadsDir, fileName), buffer);
  return `/uploads/${fileName}`;
}

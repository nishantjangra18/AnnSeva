import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { saveImageData } from '../services/image.service.js';

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['DONOR', 'COLLECTOR', 'DRIVER']),
  organization: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const profileSchema = z.object({
  name: z.string().min(2),
  organization: z.string().optional(),
  profileImageData: z.string().optional(),
  profileImageUrl: z.string().optional(),
  profile: z.object({
    address: z.object({
      fullAddress: z.string().optional().default(''),
      houseFlat: z.string().min(1),
      area: z.string().min(2),
      landmark: z.string().optional().default(''),
      label: z.enum(['Home', 'Office', 'Other']).default('Home'),
      lat: z.coerce.number(),
      lng: z.coerce.number()
    })
  })
});

function tokenFor(user) {
  return jwt.sign({ sub: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function normalizeProfile(profile) {
  const rawAddress = profile?.address;
  if (typeof rawAddress === 'string') {
    return {
      address: {
        fullAddress: rawAddress,
        houseFlat: '',
        area: '',
        landmark: '',
        label: 'Home',
        lat: profile?.lat ?? null,
        lng: profile?.lng ?? null
      }
    };
  }

  return {
    address: {
      fullAddress: rawAddress?.fullAddress || '',
      houseFlat: rawAddress?.houseFlat || '',
      area: rawAddress?.area || '',
      landmark: rawAddress?.landmark || '',
      label: rawAddress?.label || 'Home',
      lat: rawAddress?.lat ?? null,
      lng: rawAddress?.lng ?? null
    }
  };
}

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    organization: user.organization,
    profileImageUrl: user.profileImageUrl,
    profile: normalizeProfile(user.profile),
    impactScore: user.impactScore
  };
}

export async function register(req, res, next) {
  try {
    const payload = registerSchema.parse(req.body);
    const exists = await User.exists({ email: payload.email.toLowerCase() });
    if (exists) throw new AppError('Email is already registered', 409);

    const user = await User.create({
      name: payload.name,
      email: payload.email,
      passwordHash: await bcrypt.hash(payload.password, 12),
      role: payload.role,
      organization: payload.organization
    });

    res.status(201).json({ token: tokenFor(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const payload = loginSchema.parse(req.body);
    const user = await User.findOne({ email: payload.email.toLowerCase() });
    if (!user || !(await user.comparePassword(payload.password))) {
      throw new AppError('Invalid email or password', 401);
    }

    res.json({ token: tokenFor(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

export function me(req, res) {
  res.json({ user: publicUser(req.user) });
}

export async function updateProfile(req, res, next) {
  try {
    const payload = profileSchema.parse(req.body);
    const profileImageUrl = payload.profileImageData
      ? await saveImageData(payload.profileImageData)
      : payload.profileImageUrl;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        name: payload.name,
        organization: payload.organization,
        ...(profileImageUrl !== undefined ? { profileImageUrl } : {}),
        profile: payload.profile
      },
      { new: true, runValidators: true }
    );

    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

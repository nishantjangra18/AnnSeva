import { Listing } from '../models/Listing.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { createOtp, hashOtp, verifyOtp } from './otp.service.js';
import { saveImageData } from './image.service.js';

export const STAGES = ['listed', 'connected', 'picking', 'delivering', 'completed', 'cancelled'];

function assertStage(listing, expected) {
  if (listing.stage !== expected) {
    throw new AppError(`Listing must be in ${expected} stage`, 409);
  }
}

function profileLocation(user) {
  const address = user.profile?.address;
  if (address?.lat == null || address?.lng == null) {
    throw new AppError('Complete your profile map location first', 409);
  }

  const displayAddress = [address.houseFlat, address.area, address.landmark, address.fullAddress]
    .filter(Boolean)
    .join(', ') || `Pinned location (${Number(address.lat).toFixed(5)}, ${Number(address.lng).toFixed(5)})`;

  return {
    address: displayAddress,
    lat: address.lat,
    lng: address.lng,
    heading: null,
    updatedAt: new Date()
  };
}

function sanitizeListing(listing, extras = {}) {
  const plain = listing.toObject ? listing.toObject() : listing;
  if (plain.otp) {
    plain.otp = {
      donorVerifiedAt: plain.otp.donorVerifiedAt,
      collectorVerifiedAt: plain.otp.collectorVerifiedAt
    };
  }
  return { ...plain, ...extras };
}

function roleOtpExtras(listing, user) {
  const plain = listing.toObject ? listing.toObject() : listing;
  const extras = {};
  if (user?.role === 'DONOR' && plain.otp?.donorCode && !plain.otp?.donorVerifiedAt && ['connected', 'picking'].includes(plain.stage)) {
    extras.donorOtp = plain.otp.donorCode;
  }
  if (user?.role === 'COLLECTOR' && plain.otp?.collectorCode && !plain.otp?.collectorVerifiedAt && plain.stage === 'delivering') {
    extras.collectorOtp = plain.otp.collectorCode;
  }
  return extras;
}

export async function createListing(user, payload) {
  if (user.role !== 'DONOR') throw new AppError('Only donors can create listings', 403);

  const impactScore = Number(payload.foodDetails.quantity) * 10;
  const imageUrl = await saveImageData(payload.imageData);
  const listing = await Listing.create({
    donorId: user._id,
    foodDetails: { ...payload.foodDetails, imageUrl },
    locations: { donor: profileLocation(user) },
    impactScore
  });

  await User.findByIdAndUpdate(user._id, { $inc: { impactScore } });
  const populated = await listing.populate('donorId collectorId driverId', 'name role organization profile impactScore');
  return sanitizeListing(populated, roleOtpExtras(populated, user));
}

export async function listForRole(user, filter = {}) {
  const query = { deletedAt: null };

  if (user.role === 'DONOR') query.donorId = user._id;
  if (user.role === 'COLLECTOR') {
    if (filter.available === 'true') query.stage = 'listed';
    else query.$or = [{ collectorId: user._id }, { stage: 'listed' }];
  }
  if (user.role === 'DRIVER') {
    if (filter.available === 'true') query.stage = 'connected';
    else query.$or = [{ driverId: user._id }, { stage: 'connected' }];
  }

  if (filter.stage) query.stage = filter.stage;

  const listings = await Listing.find(query)
    .sort({ updatedAt: -1 })
    .populate('donorId collectorId driverId', 'name role organization profile impactScore');

  return listings.map((listing) => sanitizeListing(listing, roleOtpExtras(listing, user)));
}

export async function acceptByCollector(user, id) {
  if (user.role !== 'COLLECTOR') throw new AppError('Only collectors can accept listings', 403);

  const listing = await Listing.findOne({ _id: id, deletedAt: null });
  if (!listing) throw new AppError('Listing not found', 404);
  assertStage(listing, 'listed');

  const donorOtp = createOtp();
  listing.collectorId = user._id;
  listing.locations.collector = profileLocation(user);
  listing.otp.donorHash = await hashOtp(donorOtp);
  listing.otp.donorCode = donorOtp;
  listing.otp.collectorHash = null;
  listing.otp.collectorCode = null;
  listing.stage = 'connected';
  await listing.save();

  const populated = await listing.populate('donorId collectorId driverId', 'name role organization profile impactScore');
  return sanitizeListing(populated);
}

export async function acceptByDriver(user, id) {
  if (user.role !== 'DRIVER') throw new AppError('Only drivers can accept jobs', 403);

  const listing = await Listing.findOne({ _id: id, deletedAt: null });
  if (!listing) throw new AppError('Listing not found', 404);
  assertStage(listing, 'connected');

  listing.driverId = user._id;
  listing.stage = 'picking';
  await listing.save();
  return sanitizeListing(await listing.populate('donorId collectorId driverId', 'name role organization profile impactScore'));
}

export async function verifyPickup(user, id, otp) {
  if (user.role !== 'DRIVER') throw new AppError('Only drivers can verify pickup', 403);

  const listing = await Listing.findOne({ _id: id, deletedAt: null });
  if (!listing) throw new AppError('Listing not found', 404);
  if (String(listing.driverId) !== String(user._id)) throw new AppError('This job belongs to another driver', 403);
  assertStage(listing, 'picking');

  await verifyOtp(otp, listing.otp.donorHash);
  const collectorOtp = createOtp();
  listing.otp.donorVerifiedAt = new Date();
  listing.otp.donorCode = null;
  listing.otp.collectorHash = await hashOtp(collectorOtp);
  listing.otp.collectorCode = collectorOtp;
  listing.stage = 'delivering';
  await listing.save();
  const populated = await listing.populate('donorId collectorId driverId', 'name role organization profile impactScore');
  return sanitizeListing(populated);
}

export async function verifyDelivery(user, id, otp) {
  if (user.role !== 'DRIVER') throw new AppError('Only drivers can verify delivery', 403);

  const listing = await Listing.findOne({ _id: id, deletedAt: null });
  if (!listing) throw new AppError('Listing not found', 404);
  if (String(listing.driverId) !== String(user._id)) throw new AppError('This job belongs to another driver', 403);
  assertStage(listing, 'delivering');

  await verifyOtp(otp, listing.otp.collectorHash);
  listing.otp.collectorVerifiedAt = new Date();
  listing.otp.collectorCode = null;
  listing.stage = 'completed';
  await listing.save();
  await User.findByIdAndUpdate(listing.driverId, { $inc: { impactScore: listing.impactScore } });
  return sanitizeListing(await listing.populate('donorId collectorId driverId', 'name role organization profile impactScore'));
}

export async function rateDriver(user, id, payload) {
  if (!['DONOR', 'COLLECTOR'].includes(user.role)) throw new AppError('Only donors and collectors can rate drivers', 403);

  const listing = await Listing.findOne({ _id: id, deletedAt: null });
  if (!listing) throw new AppError('Listing not found', 404);
  assertStage(listing, 'completed');

  const allowed =
    String(listing.donorId) === String(user._id) || String(listing.collectorId) === String(user._id);
  if (!allowed) throw new AppError('You can only rate your own completed listing', 403);
  if (listing.ratings.some((rating) => String(rating.by) === String(user._id))) {
    throw new AppError('You have already rated this delivery', 409);
  }

  listing.ratings.push({ by: user._id, score: payload.score, comment: payload.comment });
  await listing.save();
  return sanitizeListing(await listing.populate('donorId collectorId driverId', 'name role organization profile impactScore'));
}

export async function updateDriverLocation(user, id, location) {
  if (user.role !== 'DRIVER') throw new AppError('Only drivers can update location', 403);
  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    throw new AppError('Valid latitude and longitude are required', 400);
  }

  const listing = await Listing.findOne({ _id: id, deletedAt: null });
  if (!listing) throw new AppError('Listing not found', 404);
  if (String(listing.driverId) !== String(user._id)) throw new AppError('This job belongs to another driver', 403);
  if (!['picking', 'delivering'].includes(listing.stage)) throw new AppError('Location updates are only allowed during active delivery', 409);

  listing.locations.driver = {
    address: location.address || 'Live driver location',
    lat: location.lat,
    lng: location.lng,
    heading: Number.isFinite(location.heading) ? location.heading : null,
    updatedAt: new Date()
  };
  await listing.save();
  return sanitizeListing(await listing.populate('donorId collectorId driverId', 'name role organization profile impactScore'));
}

export async function deleteListing(user, id) {
  if (user.role !== 'DONOR') throw new AppError('Only donors can delete listings', 403);

  const listing = await Listing.findOne({ _id: id, deletedAt: null });
  if (!listing) throw new AppError('Listing not found', 404);
  if (String(listing.donorId) !== String(user._id)) throw new AppError('You can only delete your own listings', 403);
  if (!['listed', 'connected', 'picking'].includes(listing.stage)) {
    throw new AppError('Listings cannot be cancelled after delivery starts', 409);
  }

  listing.stage = 'cancelled';
  listing.otp.donorCode = null;
  listing.otp.collectorCode = null;
  await listing.save();
  return sanitizeListing(await listing.populate('donorId collectorId driverId', 'name role organization profile impactScore'));
}

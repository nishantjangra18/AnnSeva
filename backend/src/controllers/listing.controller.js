import { z } from 'zod';
import {
  acceptByCollector,
  acceptByDriver,
  createListing,
  deleteListing,
  listForRole,
  rateDriver,
  updateDriverLocation,
  verifyDelivery,
  verifyPickup
} from '../services/listing.service.js';
import { createNotification } from '../services/notification.service.js';

const pointSchema = z.object({
  address: z.string().min(1).default('Live driver location'),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  heading: z.coerce.number().nullable().optional()
});

const createSchema = z.object({
  foodDetails: z.object({
    title: z.string().min(2),
    quantity: z.coerce.number().min(1),
    unit: z.string().optional(),
    expiry: z.coerce.date(),
    notes: z.string().optional()
  }),
  imageData: z.string().optional()
});

const otpSchema = z.object({ otp: z.string().min(4).max(12) });
const ratingSchema = z.object({ score: z.coerce.number().min(1).max(5), comment: z.string().optional() });

function emitListing(io, listing) {
  io.to(`listing:${listing._id}`).emit('listing:update', listing);
  io.emit('listings:changed', { id: listing._id, stage: listing.stage });
}

async function notifyUser(io, payload) {
  const notification = await createNotification(payload);
  if (notification) io.to(`user:${payload.userId}`).emit('notification:new', notification);
}

export async function create(req, res, next) {
  try {
    const listing = await createListing(req.user, createSchema.parse(req.body));
    emitListing(req.app.get('io'), listing);
    res.status(201).json({ listing });
  } catch (err) {
    next(err);
  }
}

export async function index(req, res, next) {
  try {
    const listings = await listForRole(req.user, req.query);
    res.json({ listings });
  } catch (err) {
    next(err);
  }
}

export async function collectorAccept(req, res, next) {
  try {
    const listing = await acceptByCollector(req.user, req.params.id);
    emitListing(req.app.get('io'), listing);
    await notifyUser(req.app.get('io'), {
      userId: listing.donorId?._id || listing.donorId,
      listingId: listing._id,
      type: 'listing_accepted',
      message: `${req.user.name} accepted your listing "${listing.foodDetails.title}".`
    });
    res.json({ listing });
  } catch (err) {
    next(err);
  }
}

export async function driverAccept(req, res, next) {
  try {
    const listing = await acceptByDriver(req.user, req.params.id);
    emitListing(req.app.get('io'), listing);
    await Promise.all([
      notifyUser(req.app.get('io'), {
        userId: listing.donorId?._id || listing.donorId,
        listingId: listing._id,
        type: 'driver_assigned',
        message: `${req.user.name} was assigned to "${listing.foodDetails.title}".`
      }),
      notifyUser(req.app.get('io'), {
        userId: listing.collectorId?._id || listing.collectorId,
        listingId: listing._id,
        type: 'driver_assigned',
        message: `${req.user.name} is driving "${listing.foodDetails.title}".`
      })
    ]);
    res.json({ listing });
  } catch (err) {
    next(err);
  }
}

export async function pickup(req, res, next) {
  try {
    const listing = await verifyPickup(req.user, req.params.id, otpSchema.parse(req.body).otp);
    emitListing(req.app.get('io'), listing);
    await Promise.all([
      notifyUser(req.app.get('io'), {
        userId: listing.donorId?._id || listing.donorId,
        listingId: listing._id,
        type: 'pickup_completed',
        message: `Pickup completed for "${listing.foodDetails.title}".`
      }),
      notifyUser(req.app.get('io'), {
        userId: listing.collectorId?._id || listing.collectorId,
        listingId: listing._id,
        type: 'pickup_completed',
        message: `"${listing.foodDetails.title}" is on the way.`
      })
    ]);
    res.json({ listing });
  } catch (err) {
    next(err);
  }
}

export async function delivery(req, res, next) {
  try {
    const listing = await verifyDelivery(req.user, req.params.id, otpSchema.parse(req.body).otp);
    emitListing(req.app.get('io'), listing);
    await Promise.all([
      notifyUser(req.app.get('io'), {
        userId: listing.donorId?._id || listing.donorId,
        listingId: listing._id,
        type: 'delivery_completed',
        message: `Delivery completed for "${listing.foodDetails.title}".`
      }),
      notifyUser(req.app.get('io'), {
        userId: listing.collectorId?._id || listing.collectorId,
        listingId: listing._id,
        type: 'delivery_completed',
        message: `"${listing.foodDetails.title}" was delivered.`
      }),
      notifyUser(req.app.get('io'), {
        userId: listing.driverId?._id || listing.driverId,
        listingId: listing._id,
        type: 'delivery_completed',
        message: `You completed "${listing.foodDetails.title}".`
      })
    ]);
    res.json({ listing });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const listing = await deleteListing(req.user, req.params.id);
    emitListing(req.app.get('io'), listing);
    if (listing.collectorId) {
      await notifyUser(req.app.get('io'), {
        userId: listing.collectorId?._id || listing.collectorId,
        listingId: listing._id,
        type: 'listing_deleted',
        message: `"${listing.foodDetails.title}" was cancelled by the donor.`
      });
    }
    if (listing.driverId) {
      await notifyUser(req.app.get('io'), {
        userId: listing.driverId?._id || listing.driverId,
        listingId: listing._id,
        type: 'listing_deleted',
        message: `"${listing.foodDetails.title}" was cancelled by the donor.`
      });
    }
    res.json({ listing });
  } catch (err) {
    next(err);
  }
}

export async function rate(req, res, next) {
  try {
    const listing = await rateDriver(req.user, req.params.id, ratingSchema.parse(req.body));
    emitListing(req.app.get('io'), listing);
    res.json({ listing });
  } catch (err) {
    next(err);
  }
}

export async function location(req, res, next) {
  try {
    const listing = await updateDriverLocation(req.user, req.params.id, pointSchema.parse(req.body));
    req.app.get('io').to(`listing:${listing._id}`).emit('driver:location', {
      listingId: String(listing._id),
      lat: listing.locations.driver.lat,
      lng: listing.locations.driver.lng,
      heading: listing.locations.driver.heading ?? null,
      location: listing.locations.driver,
      stage: listing.stage
    });
    res.json({ listing });
  } catch (err) {
    next(err);
  }
}

import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { updateDriverLocation } from '../services/listing.service.js';

async function socketUser(socket) {
  const token = socket.handshake.auth?.token;
  if (!token) return null;
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  return User.findById(payload.sub).select('-passwordHash');
}

export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[socket] connected ${socket.id}`);

    socketUser(socket)
      .then((user) => {
        if (user) {
          socket.join(`user:${user._id}`);
          console.log(`[socket] ${socket.id} authenticated as ${user.role}:${user._id}`);
        }
      })
      .catch((err) => console.warn(`[socket] auth failed for ${socket.id}: ${err.message}`));

    function joinListingRoom(eventName, listingId, ack) {
      if (!listingId) {
        ack?.({ ok: false, message: 'listingId is required' });
        return;
      }
      socket.join(`listing:${listingId}`);
      console.log(`[socket] ${eventName} ${socket.id} -> listing:${listingId}`);
      ack?.({ ok: true });
    }

    socket.on('driver:join', ({ listingId } = {}, ack) => joinListingRoom('driver:join', listingId, ack));
    socket.on('user:join', ({ listingId } = {}, ack) => joinListingRoom('user:join', listingId, ack));
    socket.on('listing:join', (listingId, ack) => joinListingRoom('listing:join', listingId, ack));

    socket.on('listing:leave', (listingId) => {
      if (listingId) {
        socket.leave(`listing:${listingId}`);
        console.log(`[socket] listing:leave ${socket.id} -> listing:${listingId}`);
      }
    });

    async function handleDriverLocation(payload = {}, ack) {
      try {
        const user = await socketUser(socket);
        if (!user) throw new Error('Authentication required');
        if (!payload.listingId) throw new Error('listingId is required');
        const listing = await updateDriverLocation(user, payload.listingId, {
          address: 'Live driver location',
          lat: Number(payload.lat),
          lng: Number(payload.lng),
          heading: payload.heading == null ? null : Number(payload.heading)
        });
        const event = {
          listingId: String(listing._id),
          lat: listing.locations.driver.lat,
          lng: listing.locations.driver.lng,
          heading: listing.locations.driver.heading ?? null,
          location: listing.locations.driver,
          stage: listing.stage,
          updatedAt: listing.locations.driver.updatedAt
        };
        console.log(`[socket] driver:location ${event.listingId} ${event.lat},${event.lng} heading=${event.heading ?? 'n/a'}`);
        io.to(`listing:${listing._id}`).emit('driver:location', {
          ...event
        });
        ack?.({ ok: true });
      } catch (err) {
        console.warn(`[socket] driver:location failed: ${err.message}`);
        ack?.({ ok: false, message: err.message });
      }
    }

    socket.on('driver:location', handleDriverLocation);
    socket.on('driver:location:update', handleDriverLocation);

    socket.on('disconnect', (reason) => {
      console.log(`[socket] disconnected ${socket.id}: ${reason}`);
    });
  });
}

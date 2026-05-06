import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null },
    message: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['listing_accepted', 'driver_assigned', 'pickup_completed', 'delivery_completed', 'listing_deleted'],
      required: true
    },
    read: { type: Boolean, default: false, index: true }
  },
  { timestamps: true }
);

export const Notification = mongoose.model('Notification', notificationSchema);

import mongoose from 'mongoose';

const pointSchema = new mongoose.Schema(
  {
    address: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    heading: { type: Number, default: null },
    updatedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const ratingSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    score: { type: Number, min: 1, max: 5 },
    comment: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const listingSchema = new mongoose.Schema(
  {
    donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    collectorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    foodDetails: {
      title: { type: String, required: true, trim: true },
      quantity: { type: Number, required: true, min: 1 },
      unit: { type: String, default: 'meals', trim: true },
      expiry: { type: Date, required: true },
      notes: { type: String, trim: true },
      imageUrl: { type: String, trim: true, default: '' }
    },
    locations: {
      donor: { type: pointSchema, required: true },
      collector: { type: pointSchema, default: null },
      driver: { type: pointSchema, default: null }
    },
    stage: {
      type: String,
      enum: ['listed', 'connected', 'picking', 'delivering', 'completed', 'cancelled'],
      default: 'listed',
      index: true
    },
    otp: {
      donorHash: { type: String, default: null },
      collectorHash: { type: String, default: null },
      donorCode: { type: String, default: null },
      collectorCode: { type: String, default: null },
      donorVerifiedAt: { type: Date, default: null },
      collectorVerifiedAt: { type: Date, default: null }
    },
    ratings: [ratingSchema],
    impactScore: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

listingSchema.index({ donorId: 1, stage: 1 });
listingSchema.index({ collectorId: 1, stage: 1 });
listingSchema.index({ driverId: 1, stage: 1 });

export const Listing = mongoose.model('Listing', listingSchema);

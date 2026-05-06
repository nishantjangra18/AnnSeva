import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['DONOR', 'COLLECTOR', 'DRIVER'], required: true },
    organization: { type: String, trim: true },
    profileImageUrl: { type: String, trim: true, default: '' },
    profile: {
      address: {
        fullAddress: { type: String, trim: true, default: '' },
        houseFlat: { type: String, trim: true, default: '' },
        area: { type: String, trim: true, default: '' },
        landmark: { type: String, trim: true, default: '' },
        label: { type: String, enum: ['Home', 'Office', 'Other'], default: 'Home' },
        lat: { type: Number, default: null },
        lng: { type: Number, default: null }
      }
    },
    impactScore: { type: Number, default: 0 }
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

export const User = mongoose.model('User', userSchema);

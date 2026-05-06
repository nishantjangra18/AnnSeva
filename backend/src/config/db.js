import mongoose from 'mongoose';

export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  if (uri.includes('<db_password>')) {
    throw new Error('Replace <db_password> in backend/.env MONGODB_URI with your real MongoDB Atlas database user password');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('MongoDB connected');
}

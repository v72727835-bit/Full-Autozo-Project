import mongoose from 'mongoose';
import { env } from './env';

mongoose.set('strictQuery', true);

export async function connectDB(): Promise<void> {
  // A bigger pool lets one instance serve many concurrent requests instead of queueing on 5 sockets.
  await mongoose.connect(env.MONGO_URI, { maxPoolSize: 50, minPoolSize: 5 });
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}

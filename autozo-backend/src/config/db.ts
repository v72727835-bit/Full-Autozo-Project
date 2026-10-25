import mongoose from 'mongoose';
import { env } from './env';

mongoose.set('strictQuery', true);

export async function connectDB(): Promise<void> {
  // MongoDB runs in the same cPanel account and spends one thread per open
  // connection, and the account's process limit counts threads. A pool of 50
  // (times every Passenger instance) could fill that limit on its own; 10
  // still serves concurrent requests, and idle sockets close after a minute.
  await mongoose.connect(env.MONGO_URI, { maxPoolSize: 10, minPoolSize: 1, maxIdleTimeMS: 60_000 });
  // Phone / email used to be unique across all accounts; they are now unique per role (see models/User.ts).
  for (const name of ['phone_1', 'email_1']) {
    try {
      await mongoose.connection.collection('users').dropIndex(name);
      console.log(`Dropped old users index ${name}`);
    } catch {
      /* already gone */
    }
  }
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}

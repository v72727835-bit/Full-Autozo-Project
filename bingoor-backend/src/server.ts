import app from './app';
import { connectDB, disconnectDB } from './config/db';
import { env } from './config/env';
import { Product } from './models/Product';

async function main() {
  await connectDB();
  // Products made before sort codes existed fall to the end, so unsorted items stay A-Z.
  await Product.updateMany({ sortCode: { $exists: false } }, { $set: { sortCode: 1_000_000 } });

  const server = app.listen(env.PORT, () => {
    console.log(`Bingoor API running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

import './config/threads';
import app from './app';
import { connectDB, disconnectDB } from './config/db';
import { env } from './config/env';
import { Product } from './models/Product';
import { startPlanReminders } from './services/subscription.service';
import { startDispatchSweep } from './services/dispatch.service';

async function main() {
  await connectDB();
  const server = app.listen(env.PORT, () => {
    console.log(`Autozo API running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    // Legacy backfill must not block Passenger startup or the health route.
    void Product.updateMany({ sortCode: { $exists: false } }, { $set: { sortCode: 1_000_000 } })
      .catch((error) => console.error('Product sort-code backfill failed:', error));
    startPlanReminders();
    // Keep service/delivery rings going and widening until someone accepts.
    startDispatchSweep();
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

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config } from './config/env.js';
import { healthRoutes } from './routes/health.routes.js';
import { scanRoutes } from './routes/scan.routes.js';
import { instantScanRoutes } from './routes/instant-scan.routes.js';
import { monitorRoutes } from './routes/monitor.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { historyRoutes } from './routes/history.routes.js';
import { watchlistRoutes, startAutoRescan } from './routes/watchlist.routes.js';
import { compareRoutes } from './routes/compare.routes.js';
import { predictionRoutes } from './routes/prediction.routes.js';
import { getDb } from './db/database.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { startTokenTracker } from './services/token-tracker.service.js';
import { startLaunchMonitor, getLaunchMonitorStats } from './services/launch-monitor.service.js';
import { getDatasetStats } from './services/token-tracker.service.js';

async function main() {
  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
  });

  // Initialize database
  getDb();

  // Plugins
  await app.register(cors, {
    origin: [
      config.server.corsOrigin,
      /^chrome-extension:\/\//,  // Allow Chrome extension
    ],
  });
  await app.register(websocket);

  // Middleware
  app.addHook('onRequest', authMiddleware);
  app.addHook('onRequest', rateLimitMiddleware);

  // Routes
  await app.register(healthRoutes);
  await app.register(scanRoutes);
  await app.register(instantScanRoutes);
  await app.register(monitorRoutes);
  await app.register(settingsRoutes);
  await app.register(historyRoutes);
  await app.register(watchlistRoutes);
  await app.register(compareRoutes);
  await app.register(predictionRoutes);

  // Start
  try {
    await app.listen({ port: config.server.port, host: config.server.host });
    console.log(`\n  Trenchable API running at http://localhost:${config.server.port}`);
    console.log(`  WebSocket monitor at ws://localhost:${config.server.port}/api/ws/monitor`);
    console.log(`  Health check at http://localhost:${config.server.port}/api/health\n`);

    // Start watchlist auto-rescan
    startAutoRescan();

    // Start MC prediction data collection pipeline
    startTokenTracker();
    startLaunchMonitor();
    console.log('  [MC Pipeline] Token tracker + launch monitor started');
    console.log('  [MC Pipeline] Run: npx tsx scripts/backtest.ts to seed historical data\n');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();

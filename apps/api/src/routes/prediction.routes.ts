import type { FastifyInstance } from 'fastify';
import { getDatasetStats } from '../services/token-tracker.service.js';
import { getLaunchMonitorStats } from '../services/launch-monitor.service.js';

export async function predictionRoutes(app: FastifyInstance) {
  // MC prediction dataset stats
  app.get('/api/prediction/stats', async () => {
    const dataset = getDatasetStats();
    const monitor = getLaunchMonitorStats();

    return {
      dataset,
      monitor,
      prediction: {
        ready: dataset.tokensWithOutcomes >= 100,
        quality: dataset.tokensWithOutcomes >= 200 ? 'statistical'
          : dataset.tokensWithOutcomes >= 100 ? 'heuristic+'
          : 'collecting',
        message: dataset.tokensWithOutcomes >= 100
          ? `Predictions based on ${dataset.tokensWithOutcomes} real outcomes`
          : `Collecting data: ${dataset.tokensWithOutcomes}/100 outcomes needed. ` +
            `${dataset.totalTokens} tokens scanned, waiting for 1h/6h/24h checks.`,
      },
    };
  });
}

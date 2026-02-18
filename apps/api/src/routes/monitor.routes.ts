import type { FastifyInstance } from 'fastify';
import { addPairListener } from '../services/pair-monitor.service.js';

export async function monitorRoutes(app: FastifyInstance) {
  app.get('/api/ws/monitor', { websocket: true }, (socket) => {
    console.log('[WS] Client connected to pair monitor');

    const removeListener = addPairListener((event) => {
      try {
        socket.send(JSON.stringify(event));
      } catch {
        // Client disconnected
      }
    });

    socket.on('close', () => {
      console.log('[WS] Client disconnected from pair monitor');
      removeListener();
    });

    socket.on('error', () => {
      removeListener();
    });
  });
}

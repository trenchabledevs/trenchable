import { Connection } from '@solana/web3.js';
import { config } from './env.js';

let connection: Connection | null = null;

export function getConnection(): Connection {
  if (connection) return connection;

  const endpoint = config.rpc.primary || config.rpc.fallback;
  const wsEndpoint = config.rpc.ws || undefined;

  connection = new Connection(endpoint, {
    commitment: 'confirmed',
    wsEndpoint,
    confirmTransactionInitialTimeout: 60_000,
  });

  return connection;
}

export function updateConnection(rpcUrl: string): Connection {
  connection = new Connection(rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60_000,
  });
  return connection;
}

export async function testConnection(conn?: Connection): Promise<{ ok: boolean; latencyMs: number }> {
  const c = conn || getConnection();
  const start = Date.now();
  try {
    await c.getSlot();
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

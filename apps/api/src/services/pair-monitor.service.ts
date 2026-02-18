import { PublicKey } from '@solana/web3.js';
import { PROGRAM_IDS, type NewPairEvent } from '@trenchable/shared';
import { getConnection } from '../config/rpc.js';

type PairListener = (event: NewPairEvent) => void;

const listeners = new Set<PairListener>();
let subscriptionIds: number[] = [];
let isMonitoring = false;

export function addPairListener(listener: PairListener): () => void {
  listeners.add(listener);
  if (!isMonitoring) {
    startMonitoring();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopMonitoring();
    }
  };
}

function emit(event: NewPairEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Ignore listener errors
    }
  }
}

function startMonitoring() {
  if (isMonitoring) return;
  isMonitoring = true;

  const connection = getConnection();

  try {
    // Monitor pump.fun for new token creates
    const pumpFunSub = connection.onLogs(
      new PublicKey(PROGRAM_IDS.PUMP_FUN),
      (logs) => {
        // Look for "create" instruction in pump.fun program
        const hasCreate = logs.logs.some(
          log => log.includes('Instruction: Create') || log.includes('Instruction: Initialize')
        );

        if (hasCreate) {
          // Extract token mint from the transaction accounts
          // For pump.fun creates, the new token mint is typically in the logs
          const mintMatch = logs.logs.find(l => l.includes('mint:'));
          const tokenMint = mintMatch
            ? mintMatch.split('mint:')[1]?.trim()
            : logs.signature; // fallback to signature as identifier

          emit({
            type: 'new_pair',
            platform: 'pump.fun',
            tokenMint: tokenMint || 'unknown',
            tokenName: null,
            tokenSymbol: null,
            creator: '',
            initialLiquidity: null,
            timestamp: Date.now(),
          });
        }
      },
      'confirmed'
    );
    subscriptionIds.push(pumpFunSub);

    // Monitor Raydium V4 for new pool initializations
    const raydiumSub = connection.onLogs(
      new PublicKey(PROGRAM_IDS.RAYDIUM_V4_AMM),
      (logs) => {
        const hasInit = logs.logs.some(
          log => log.includes('Instruction: Initialize') || log.includes('initialize2')
        );

        if (hasInit) {
          emit({
            type: 'new_pair',
            platform: 'raydium',
            tokenMint: 'unknown',
            tokenName: null,
            tokenSymbol: null,
            creator: '',
            initialLiquidity: null,
            timestamp: Date.now(),
          });
        }
      },
      'confirmed'
    );
    subscriptionIds.push(raydiumSub);

    console.log('[PairMonitor] Started monitoring pump.fun and Raydium for new pairs');
  } catch (error) {
    console.error('[PairMonitor] Failed to start monitoring:', error);
    isMonitoring = false;
  }
}

function stopMonitoring() {
  if (!isMonitoring) return;

  const connection = getConnection();
  for (const id of subscriptionIds) {
    connection.removeOnLogsListener(id).catch(() => {});
  }
  subscriptionIds = [];
  isMonitoring = false;
  console.log('[PairMonitor] Stopped monitoring');
}

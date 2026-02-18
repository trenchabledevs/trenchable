import { API_BASE_URL } from './config.js';

export interface ScanResult {
  tokenMint: string;
  tokenName: string | null;
  tokenSymbol: string | null;
  tokenImage: string | null;
  overallScore: number;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  checks: {
    check: string;
    status: string;
    score: number;
    weight: number;
    message: string;
    details: Record<string, unknown>;
  }[];
  scanMode: 'instant' | 'deep';
  scanDurationMs: number;
  platform: string;
  market: {
    priceUsd: number | null;
    marketCap: number | null;
    liquidity: number | null;
    volume24h: number | null;
    priceChange24h: number | null;
  } | null;
  mcPrediction: {
    currentMC: number | null;
    bondingCurve: {
      progressPct: number;
      remainingToGraduateSol: number;
      estimatedGraduationMC: number;
    } | null;
    signals: {
      liquidityRatio: number;
      liquidityScore: number;
      momentumScore: number;
      holderStage: string;
      concentrationRisk: string;
      tokenAge: string;
    };
    fairValue: {
      low: number;
      mid: number;
      high: number;
      trend: string;
    };
    summary: string;
    confidence: string;
  } | null;
}

/**
 * Fetch instant scan result from API
 */
export async function fetchInstantScan(mint: string, apiKey?: string): Promise<ScanResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers['X-API-Key'] = apiKey;

  const res = await fetch(`${API_BASE_URL}/api/scan/instant/${mint}`, { headers });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * Fetch deep scan result from API
 */
export async function fetchDeepScan(mint: string, apiKey?: string): Promise<ScanResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers['X-API-Key'] = apiKey;

  const res = await fetch(`${API_BASE_URL}/api/scan/deep/${mint}`, { headers });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * Stream scan results via SSE (instant first, then deep)
 */
export function streamScan(
  mint: string,
  callbacks: {
    onInstant: (data: ScanResult) => void;
    onDeep: (data: ScanResult) => void;
    onError: (error: string) => void;
    onDone: () => void;
  },
  apiKey?: string
): () => void {
  const url = new URL(`${API_BASE_URL}/api/scan/stream/${mint}`);
  const eventSource = new EventSource(url.toString());

  eventSource.addEventListener('instant', (event) => {
    const parsed = JSON.parse(event.data);
    if (parsed.status === 'complete' && parsed.data) {
      callbacks.onInstant(parsed.data);
    }
  });

  eventSource.addEventListener('deep', (event) => {
    const parsed = JSON.parse(event.data);
    if (parsed.status === 'complete' && parsed.data) {
      callbacks.onDeep(parsed.data);
    }
  });

  eventSource.addEventListener('done', () => {
    callbacks.onDone();
    eventSource.close();
  });

  eventSource.addEventListener('error', (event) => {
    callbacks.onError('Connection lost');
    eventSource.close();
  });

  // Return cleanup function
  return () => eventSource.close();
}

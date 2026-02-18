import type { ScanResponse, ExtendedScanResponse, HealthResponse, ScanHistoryEntry, WatchlistEntry, ComparisonData } from '@trenchable/shared';

const API_BASE = (import.meta.env.VITE_API_URL ?? '') + '/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.message || error.error || 'Request failed');
  }
  return res.json();
}

// Scan
export function scanToken(tokenMint: string): Promise<ScanResponse> {
  return fetchJSON<ScanResponse>('/scan', {
    method: 'POST',
    body: JSON.stringify({ tokenMint }),
  });
}

export function getScan(tokenMint: string): Promise<ScanResponse> {
  return fetchJSON<ScanResponse>(`/scan/${tokenMint}`);
}

export function getInstantScan(tokenMint: string): Promise<ExtendedScanResponse> {
  return fetchJSON<ExtendedScanResponse>(`/scan/instant/${tokenMint}`);
}

export function getDeepScan(tokenMint: string): Promise<ExtendedScanResponse> {
  return fetchJSON<ExtendedScanResponse>(`/scan/deep/${tokenMint}`);
}

// Health
export function getHealth(): Promise<HealthResponse> {
  return fetchJSON<HealthResponse>('/health');
}

// Settings
export function updateRpc(primaryRpc: string): Promise<{ success: boolean; latencyMs: number }> {
  return fetchJSON('/settings/rpc', {
    method: 'PUT',
    body: JSON.stringify({ primaryRpc }),
  });
}

export function getRpcSettings(): Promise<{ primaryRpc: string | null; fallbackRpc: string }> {
  return fetchJSON('/settings/rpc');
}

// History
export function getScanHistory(limit = 50, offset = 0): Promise<ScanHistoryEntry[]> {
  return fetchJSON<ScanHistoryEntry[]>(`/history?limit=${limit}&offset=${offset}`);
}

export function getTokenHistory(tokenMint: string): Promise<ScanHistoryEntry[]> {
  return fetchJSON<ScanHistoryEntry[]>(`/history/${tokenMint}`);
}

export function clearHistory(): Promise<{ success: boolean }> {
  return fetchJSON('/history', { method: 'DELETE' });
}

// Watchlist
export function getWatchlist(): Promise<WatchlistEntry[]> {
  return fetchJSON<WatchlistEntry[]>('/watchlist');
}

export function addToWatchlist(data: {
  tokenMint: string;
  tokenName?: string | null;
  tokenSymbol?: string | null;
  latestScore?: number;
  riskLevel?: string;
  platform?: string;
}): Promise<WatchlistEntry> {
  return fetchJSON<WatchlistEntry>('/watchlist', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function removeFromWatchlist(tokenMint: string): Promise<{ success: boolean }> {
  return fetchJSON(`/watchlist/${tokenMint}`, { method: 'DELETE' });
}

export function rescanAllWatchlist(): Promise<{ rescanned: number; results: { tokenMint: string; newScore: number; previousScore: number | null }[] }> {
  return fetchJSON('/watchlist/rescan-all', { method: 'POST' });
}

// Compare
export function compareTokens(tokenMints: string[]): Promise<ComparisonData> {
  return fetchJSON<ComparisonData>('/compare', {
    method: 'POST',
    body: JSON.stringify({ tokenMints }),
  });
}

import { INSTANT_CACHE_TTL, DEEP_CACHE_TTL } from './config.js';

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

/**
 * Cache layer using chrome.storage.local
 */
export async function getCachedScan(
  mint: string,
  mode: 'instant' | 'deep'
): Promise<any | null> {
  try {
    const key = `scan:${mode}:${mint}`;
    const result = await chrome.storage.local.get(key);
    const entry = result[key] as CacheEntry<any> | undefined;

    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      await chrome.storage.local.remove(key);
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

export async function setCachedScan(
  mint: string,
  mode: 'instant' | 'deep',
  data: any
): Promise<void> {
  try {
    const key = `scan:${mode}:${mint}`;
    const ttl = mode === 'instant' ? INSTANT_CACHE_TTL : DEEP_CACHE_TTL;
    const entry: CacheEntry<any> = {
      data,
      expiry: Date.now() + ttl,
    };
    await chrome.storage.local.set({ [key]: entry });
  } catch {
    // Storage quota exceeded — silently fail
  }
}

/**
 * Get/set API settings from storage
 */
export async function getSettings(): Promise<{ apiKey: string; apiUrl: string }> {
  try {
    const result = await chrome.storage.local.get(['trenchable_api_key', 'trenchable_api_url']);
    return {
      apiKey: result.trenchable_api_key || '',
      apiUrl: result.trenchable_api_url || '',
    };
  } catch {
    return { apiKey: '', apiUrl: '' };
  }
}

export async function saveSettings(settings: { apiKey?: string; apiUrl?: string }): Promise<void> {
  const updates: Record<string, string> = {};
  if (settings.apiKey !== undefined) updates.trenchable_api_key = settings.apiKey;
  if (settings.apiUrl !== undefined) updates.trenchable_api_url = settings.apiUrl;
  await chrome.storage.local.set(updates);
}

/**
 * Clean up expired cache entries
 */
export async function cleanExpiredCache(): Promise<void> {
  try {
    const all = await chrome.storage.local.get(null);
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith('scan:') && (value as CacheEntry<any>).expiry < now) {
        keysToRemove.push(key);
      }
    }

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
  } catch {
    // ignore
  }
}

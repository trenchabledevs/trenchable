import { PLATFORM_PATTERNS } from '../lib/config.js';
import { fetchInstantScan, fetchDeepScan } from '../lib/api.js';
import { getCachedScan, setCachedScan, getSettings, cleanExpiredCache } from '../lib/cache.js';

/**
 * Background service worker for Trenchable Chrome extension.
 * - Detects when user navigates to a token page on supported platforms
 * - Prefetches instant scan results
 * - Communicates results to content scripts and popup
 */

// ─── URL Change Detection ───

// Listen for tab URL changes (catches SPA navigations)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    const mint = extractMintFromUrl(changeInfo.url);
    if (mint) {
      handleTokenDetected(tabId, mint, changeInfo.url);
    }
  }
});

// Listen for tab activation (user switches tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      const mint = extractMintFromUrl(tab.url);
      if (mint) {
        handleTokenDetected(activeInfo.tabId, mint, tab.url);
      }
    }
  } catch {
    // Tab might have been closed
  }
});

// ─── Token Detection & Prefetch ───

async function handleTokenDetected(tabId: number, mint: string, url: string) {
  console.log(`[Trenchable] Token detected: ${mint} on ${url}`);

  // Update extension badge
  chrome.action.setBadgeText({ text: '...', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#8b5cf6', tabId });

  // Check cache first
  const cached = await getCachedScan(mint, 'instant');
  if (cached) {
    console.log(`[Trenchable] Cache hit for ${mint}`);
    sendResultToTab(tabId, cached);
    updateBadge(tabId, cached.overallScore, cached.riskLevel);
    return;
  }

  // Prefetch instant scan
  try {
    const settings = await getSettings();
    const result = await fetchInstantScan(mint, settings.apiKey || undefined);

    // Cache the result
    await setCachedScan(mint, 'instant', result);

    // Send to content script
    sendResultToTab(tabId, result);

    // Update badge
    updateBadge(tabId, result.overallScore, result.riskLevel);

    console.log(`[Trenchable] Instant scan complete: ${mint} → score ${result.overallScore} (${result.scanDurationMs}ms)`);
  } catch (error) {
    console.error(`[Trenchable] Scan failed for ${mint}:`, error);
    chrome.action.setBadgeText({ text: '!', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId });
  }
}

function sendResultToTab(tabId: number, result: any) {
  chrome.tabs.sendMessage(tabId, {
    type: 'TRENCHABLE_SCAN_RESULT',
    data: result,
  }).catch(() => {
    // Content script might not be loaded yet
  });
}

function updateBadge(tabId: number, score: number, riskLevel: string) {
  const colors: Record<string, string> = {
    low: '#22c55e',
    moderate: '#eab308',
    high: '#f97316',
    critical: '#ef4444',
  };

  chrome.action.setBadgeText({ text: score.toString(), tabId });
  chrome.action.setBadgeBackgroundColor({
    color: colors[riskLevel] || '#8b5cf6',
    tabId,
  });
}

// ─── URL Parsing ───

function extractMintFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);

    // Axiom: axiom.trade/meme/<MINT>
    if (parsed.hostname === PLATFORM_PATTERNS.axiom.domain) {
      const match = parsed.pathname.match(PLATFORM_PATTERNS.axiom.pathRegex);
      return match ? match[1] : null;
    }

    // pump.fun: pump.fun/coin/<MINT> or pump.fun/<MINT>
    if (parsed.hostname === PLATFORM_PATTERNS.pumpfun.domain) {
      const match = parsed.pathname.match(PLATFORM_PATTERNS.pumpfun.pathRegex);
      return match ? match[1] : null;
    }

    // Photon: /r/<MINT> or /#r@<MINT>
    if (parsed.hostname === PLATFORM_PATTERNS.photon.domain) {
      const pathMatch = parsed.pathname.match(PLATFORM_PATTERNS.photon.pathRegex);
      if (pathMatch) return pathMatch[1];
      const hashMatch = (parsed.hash + url).match(PLATFORM_PATTERNS.photon.hashRegex);
      return hashMatch ? hashMatch[1] : null;
    }

    // BullX: /terminal?chainId=solana&address=<MINT>
    if (parsed.hostname === PLATFORM_PATTERNS.bullx.domain) {
      const address = parsed.searchParams.get(PLATFORM_PATTERNS.bullx.paramKey);
      const chainId = parsed.searchParams.get('chainId');
      if (address && (!chainId || chainId === 'solana') && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        return address;
      }
      return null;
    }

    // DexScreener: /solana/<MINT>
    if (parsed.hostname === PLATFORM_PATTERNS.dexscreener.domain) {
      const match = parsed.pathname.match(PLATFORM_PATTERNS.dexscreener.pathRegex);
      return match ? match[1] : null;
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Message Handling (from popup & content scripts) ───

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRENCHABLE_GET_SCAN') {
    const mode: 'instant' | 'deep' = message.mode === 'deep' ? 'deep' : 'instant';
    handleScanRequest(message.mint, mode, sender.tab?.id).then(sendResponse);
    return true; // async response
  }

  if (message.type === 'TRENCHABLE_GET_ACTIVE_MINT') {
    getActiveMint().then(sendResponse);
    return true;
  }
});

async function handleScanRequest(mint: string, mode: 'instant' | 'deep', tabId?: number): Promise<any> {
  const cachedMode = mode === 'deep' ? 'deep' : 'instant';

  // Check cache first
  const cached = await getCachedScan(mint, cachedMode);
  if (cached) {
    if (tabId) sendResultToTab(tabId, cached);
    return { success: true, data: cached };
  }

  try {
    const settings = await getSettings();
    let result: any;

    if (mode === 'deep') {
      result = await fetchDeepScan(mint, settings.apiKey || undefined);
      await setCachedScan(mint, 'deep', result);
    } else {
      result = await fetchInstantScan(mint, settings.apiKey || undefined);
      await setCachedScan(mint, 'instant', result);
    }

    if (tabId) {
      updateBadge(tabId, result.overallScore, result.riskLevel);
      // Push updated result to content script overlay
      sendResultToTab(tabId, result);
    }

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function getActiveMint(): Promise<{ mint: string | null }> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const mint = extractMintFromUrl(tab.url);
      return { mint };
    }
    return { mint: null };
  } catch {
    return { mint: null };
  }
}

// ─── Periodic Cleanup ───

// Clean expired cache every 5 minutes
chrome.alarms.create('cache-cleanup', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cache-cleanup') {
    cleanExpiredCache();
  }
});

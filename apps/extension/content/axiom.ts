/**
 * Content script for axiom.trade
 * Detects token mint addresses from URL and injects Trenchable overlay.
 * Handles SPA navigation via MutationObserver + Navigation API + polling.
 * Injected on all axiom.trade/* pages so coin clicks from the main feed are caught.
 */
import { PLATFORM_PATTERNS } from '../lib/config.js';
import { injectOverlay, removeOverlay, showOverlayLoading } from './overlay.js';

let currentMint: string | null = null;
let lastUrl = location.href;
let scanInFlight = false;

// ─── URL Parsing ───

function extractMint(): string | null {
  const match = window.location.pathname.match(PLATFORM_PATTERNS.axiom.pathRegex);
  return match ? match[1] : null;
}

// ─── Scan + Inject ───

async function scanAndInject(mint: string) {
  if (scanInFlight && currentMint === mint) return;
  scanInFlight = true;

  console.log(`[Trenchable] Axiom: Scanning ${mint}...`);

  // Show loading state immediately so user knows something is happening
  showOverlayLoading(mint);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TRENCHABLE_GET_SCAN',
      mint,
    });

    if (response?.success && response.data) {
      // Only inject if we're still on the same token
      if (currentMint === mint) {
        injectOverlay(response.data);
      }
    } else if (response?.error) {
      console.error(`[Trenchable] Scan error: ${response.error}`);
      if (currentMint === mint) removeOverlay();
    }
  } catch (err) {
    console.error('[Trenchable] Message failed:', err);
    if (currentMint === mint) removeOverlay();
  } finally {
    scanInFlight = false;
  }
}

// ─── SPA Navigation Detection ───

function checkForNavigation() {
  const newUrl = location.href;
  if (newUrl === lastUrl) return;
  lastUrl = newUrl;

  const mint = extractMint();

  if (mint && mint !== currentMint) {
    currentMint = mint;
    scanInFlight = false;
    scanAndInject(mint);
  } else if (!mint && currentMint) {
    currentMint = null;
    scanInFlight = false;
    removeOverlay();
  }
}

// Use Navigation API if available (modern Chrome, best for SPAs)
if ('navigation' in window) {
  (window as any).navigation.addEventListener('navigate', () => {
    // Small delay to let the URL update
    setTimeout(checkForNavigation, 50);
  });
}

// Watch for SPA route changes via MutationObserver
const observer = new MutationObserver(checkForNavigation);
observer.observe(document.documentElement, { subtree: true, childList: true });

// Poll URL changes as a fallback
setInterval(checkForNavigation, 300);

// Also listen for background pushing results (e.g. from tabs.onUpdated prefetch)
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TRENCHABLE_SCAN_RESULT' && message.data) {
    if (message.data.tokenMint === currentMint) {
      injectOverlay(message.data);
      scanInFlight = false;
    }
  }
});

// ─── Initial Check ───

const initialMint = extractMint();
if (initialMint) {
  currentMint = initialMint;
  scanAndInject(initialMint);
}

/**
 * Content script for axiom.trade
 * Detects token mint addresses from URL and injects Trenchable overlay.
 * Handles SPA navigation via MutationObserver.
 */
import { PLATFORM_PATTERNS } from '../lib/config.js';
import { injectOverlay, removeOverlay } from './overlay.js';

let currentMint: string | null = null;
let lastUrl = location.href;

// ─── URL Parsing ───

function extractMint(): string | null {
  const match = window.location.pathname.match(PLATFORM_PATTERNS.axiom.pathRegex);
  return match ? match[1] : null;
}

// ─── Scan + Inject ───

async function scanAndInject(mint: string) {
  console.log(`[Trenchable] Axiom: Scanning ${mint}...`);

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
    }
  } catch (err) {
    console.error('[Trenchable] Message failed:', err);
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
    scanAndInject(mint);
  } else if (!mint && currentMint) {
    currentMint = null;
    removeOverlay();
  }
}

// Watch for SPA route changes via MutationObserver
const observer = new MutationObserver(checkForNavigation);
observer.observe(document.body, { subtree: true, childList: true });

// Also poll URL changes as a fallback (some SPAs don't trigger MutationObserver)
setInterval(checkForNavigation, 500);

// Also listen for background pushing results (e.g. from tabs.onUpdated prefetch)
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TRENCHABLE_SCAN_RESULT' && message.data) {
    if (message.data.tokenMint === currentMint) {
      injectOverlay(message.data);
    }
  }
});

// ─── Initial Check ───

const initialMint = extractMint();
if (initialMint) {
  currentMint = initialMint;
  scanAndInject(initialMint);
}

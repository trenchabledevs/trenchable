/**
 * Content script for dexscreener.com
 * Detects Solana token mint addresses from URL path and injects Trenchable overlay.
 * DexScreener URLs: /solana/<MINT_OR_PAIR>
 */
import { PLATFORM_PATTERNS } from '../lib/config.js';
import { injectOverlay, removeOverlay } from './overlay.js';

let currentMint: string | null = null;
let lastUrl = location.href;

// ─── URL Parsing ───

function extractMint(): string | null {
  const match = window.location.pathname.match(PLATFORM_PATTERNS.dexscreener.pathRegex);
  return match ? match[1] : null;
}

// ─── Scan + Inject ───

async function scanAndInject(mint: string) {
  console.log(`[Trenchable] DexScreener: Scanning ${mint}...`);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TRENCHABLE_GET_SCAN',
      mint,
    });

    if (response?.success && response.data) {
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

// Watch for SPA route changes
const observer = new MutationObserver(checkForNavigation);
observer.observe(document.body, { subtree: true, childList: true });

// Poll URL as fallback
setInterval(checkForNavigation, 500);

// Navigation API where available
try {
  (window as any).navigation?.addEventListener('navigate', () => {
    setTimeout(checkForNavigation, 100);
  });
} catch { /* not supported */ }

// Listen for background pushing results
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

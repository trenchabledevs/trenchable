/**
 * Content script for photon-sol.tinyastro.io
 * Detects token mint addresses from URL path or hash and injects Trenchable overlay.
 * Handles SPA navigation via MutationObserver + polling fallback.
 * Photon URLs: /r/<MINT> or /#r@<MINT>
 */
import { PLATFORM_PATTERNS } from '../lib/config.js';
import { injectOverlay, removeOverlay } from './overlay.js';

let currentMint: string | null = null;
let lastUrl = location.href;

// ─── URL Parsing ───

function extractMint(): string | null {
  const pattern = PLATFORM_PATTERNS.photon;

  // Try path match: /r/<MINT> or /en/<MINT>
  const pathMatch = window.location.pathname.match(pattern.pathRegex);
  if (pathMatch) return pathMatch[1];

  // Try hash match: #r@<MINT>
  const hashMatch = (window.location.hash + window.location.href).match(pattern.hashRegex);
  if (hashMatch) return hashMatch[1];

  return null;
}

// ─── Scan + Inject ───

async function scanAndInject(mint: string) {
  console.log(`[Trenchable] Photon: Scanning ${mint}...`);

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

// Watch for SPA route changes via MutationObserver
const observer = new MutationObserver(checkForNavigation);
observer.observe(document.body, { subtree: true, childList: true });

// Poll URL + hash changes as fallback
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

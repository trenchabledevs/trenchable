/**
 * Popup script for Trenchable Chrome extension.
 * Handles manual address input and displays scan results.
 */

import { fetchInstantScan, fetchDeepScan, type ScanResult } from '../lib/api.js';
import { getCachedScan, setCachedScan, getSettings } from '../lib/cache.js';

// ─── DOM References ───

const mintInput = document.getElementById('mint-input') as HTMLInputElement;
const scanBtn = document.getElementById('scan-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const resultEl = document.getElementById('result') as HTMLDivElement;
const deepScanBtn = document.getElementById('deep-scan-btn') as HTMLButtonElement;

// ─── Event Listeners ───

scanBtn.addEventListener('click', () => handleScan(mintInput.value.trim()));
mintInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleScan(mintInput.value.trim());
});
deepScanBtn.addEventListener('click', handleDeepScan);

// ─── Initialize ───

(async () => {
  // Check if active tab has a detected token
  const response = await chrome.runtime.sendMessage({ type: 'TRENCHABLE_GET_ACTIVE_MINT' });

  if (response?.mint) {
    mintInput.value = response.mint;
    handleScan(response.mint);
  }
})();

// ─── Scan Handler ───

let currentMint = '';

async function handleScan(mint: string) {
  if (!mint || mint.length < 32 || mint.length > 44) {
    showStatus('Enter a valid Solana token address', 'error');
    return;
  }

  currentMint = mint;
  showStatus('Scanning...', 'loading');
  resultEl.classList.add('hidden');
  deepScanBtn.classList.add('hidden');

  try {
    // Check cache
    const cached = await getCachedScan(mint, 'instant');
    if (cached) {
      renderResult(cached);
      return;
    }

    const settings = await getSettings();
    const result = await fetchInstantScan(mint, settings.apiKey || undefined);
    await setCachedScan(mint, 'instant', result);
    renderResult(result);
  } catch (error) {
    showStatus(`Scan failed: ${error}`, 'error');
  }
}

async function handleDeepScan() {
  if (!currentMint) return;

  deepScanBtn.textContent = 'Scanning...';
  deepScanBtn.disabled = true;

  try {
    const settings = await getSettings();
    const result = await fetchDeepScan(currentMint, settings.apiKey || undefined);
    await setCachedScan(currentMint, 'deep', result);
    renderResult(result);
    deepScanBtn.classList.add('hidden');
  } catch (error) {
    showStatus(`Deep scan failed: ${error}`, 'error');
    deepScanBtn.textContent = 'Run Deep Scan';
    deepScanBtn.disabled = false;
  }
}

// ─── Rendering ───

function renderResult(result: ScanResult) {
  statusEl.classList.add('hidden');
  resultEl.classList.remove('hidden');

  // Token info
  const imageEl = document.getElementById('token-image') as HTMLImageElement;
  if (result.tokenImage) {
    imageEl.src = result.tokenImage;
    imageEl.style.display = 'block';
  } else {
    imageEl.style.display = 'none';
  }

  const displayName = result.tokenName || (result.tokenSymbol ? result.tokenSymbol : null) || shortenMint(result.tokenMint);
  setText('token-name', displayName);
  setText('token-symbol', result.tokenSymbol ? `$${result.tokenSymbol}` : '');
  setText('token-platform', result.platform || '');

  // Risk score badge
  const badge = document.getElementById('risk-badge')!;
  badge.style.background = getRiskColor(result.riskLevel);
  setText('risk-score', result.overallScore.toString());

  // Risk level bar
  const fill = document.getElementById('risk-fill') as HTMLDivElement;
  fill.style.width = `${result.overallScore}%`;
  fill.style.background = getRiskColor(result.riskLevel);

  const levelLabel = document.getElementById('risk-level-label')!;
  levelLabel.textContent = result.riskLevel.toUpperCase();
  levelLabel.style.color = getRiskColor(result.riskLevel);

  setText('scan-mode', result.scanMode || 'instant');
  setText('scan-time', `${result.scanDurationMs}ms`);

  // Market data
  if (result.market) {
    const m = result.market;
    setText('market-price', m.priceUsd != null ? formatPrice(m.priceUsd) : '—');
    setText('market-mc', m.marketCap ? `$${formatNumber(m.marketCap)}` : '—');
    setText('market-liq', m.liquidity ? `$${formatNumber(m.liquidity)}` : '—');

    const changeEl = document.getElementById('market-change')!;
    if (m.priceChange24h !== null && m.priceChange24h !== undefined) {
      changeEl.textContent = `${m.priceChange24h >= 0 ? '+' : ''}${m.priceChange24h.toFixed(1)}%`;
      changeEl.style.color = m.priceChange24h >= 0 ? '#22c55e' : '#ef4444';
    } else {
      changeEl.textContent = '—';
      changeEl.style.color = '';
    }

    document.getElementById('market-grid')!.classList.remove('hidden');
  }

  // MC Prediction
  renderMCPrediction(result.mcPrediction);

  // Risk checks
  renderChecks(result.checks);

  // Deep scan button
  if (result.scanMode === 'instant') {
    deepScanBtn.classList.remove('hidden');
    deepScanBtn.textContent = 'Run Deep Scan';
    deepScanBtn.disabled = false;
  }
}

function renderMCPrediction(mc: ScanResult['mcPrediction']) {
  const section = document.getElementById('mc-prediction')!;

  if (!mc) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');

  // Bonding curve
  const bcSection = document.getElementById('bc-progress')!;
  if (mc.bondingCurve) {
    bcSection.classList.remove('hidden');
    const fill = document.getElementById('bc-fill') as HTMLDivElement;
    fill.style.width = `${Math.min(mc.bondingCurve.progressPct, 100)}%`;
    setText('bc-pct', `${mc.bondingCurve.progressPct.toFixed(0)}%`);
  } else {
    bcSection.classList.add('hidden');
  }

  // Fair value range
  if (mc.fairValue && mc.fairValue.high > 0) {
    setText('mc-range-value', `$${formatNumber(mc.fairValue.low)} — $${formatNumber(mc.fairValue.high)}`);
    document.getElementById('mc-range')!.classList.remove('hidden');
  } else {
    document.getElementById('mc-range')!.classList.add('hidden');
  }

  // Summary
  setText('mc-summary', mc.summary || '');

  // Confidence
  const confDot = document.querySelector('#mc-confidence .confidence-dot') as HTMLElement;
  const confColors: Record<string, string> = {
    low: '#ef4444',
    medium: '#eab308',
    high: '#22c55e',
  };
  if (confDot) confDot.style.background = confColors[mc.confidence] || '#64748b';
  setText('mc-confidence-text', `${mc.confidence} confidence`);
}

function renderChecks(checks: ScanResult['checks']) {
  const container = document.getElementById('checks-list')!;
  container.innerHTML = '';

  // Sort: danger first, then warning, then unknown, then safe; within group by score desc
  const statusOrder: Record<string, number> = { danger: 0, warning: 1, unknown: 2, safe: 3 };
  const sorted = [...checks].sort((a, b) => {
    const diff = (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2);
    return diff !== 0 ? diff : b.score - a.score;
  });

  for (const check of sorted) {
    const el = document.createElement('div');
    el.className = `check-item check-${check.status}`;
    el.innerHTML = `
      <div class="check-header">
        <span class="check-dot" style="background: ${getStatusColor(check.status)}"></span>
        <span class="check-name">${formatCheckName(check.check)}</span>
        <span class="check-score" style="color: ${getStatusColor(check.status)}">${check.score}</span>
      </div>
      <div class="check-message">${escapeHtml(check.message)}</div>
    `;
    container.appendChild(el);
  }
}

// ─── Helpers ───

function showStatus(message: string, type: 'loading' | 'error') {
  statusEl.textContent = message;
  statusEl.className = `status status-${type}`;
  statusEl.classList.remove('hidden');
}

function setText(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function getRiskColor(level: string): string {
  const colors: Record<string, string> = {
    low: '#22c55e',
    moderate: '#eab308',
    high: '#f97316',
    critical: '#ef4444',
  };
  return colors[level] || '#8b5cf6';
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    safe: '#22c55e',
    warning: '#eab308',
    danger: '#ef4444',
    unknown: '#64748b',
  };
  return colors[status] || '#64748b';
}

function formatCheckName(check: string): string {
  return check.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatNumber(num: number): string {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(0);
}

function formatPrice(price: number): string {
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.0001) return `$${price.toFixed(6)}`;
  return `$${price.toExponential(2)}`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function shortenMint(mint: string): string {
  if (!mint || mint.length < 12) return mint || 'Unknown';
  return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
}

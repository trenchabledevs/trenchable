/**
 * Shadow DOM overlay injection for Trenchable scan results.
 * Creates a floating panel on trading pages showing risk score + MC prediction.
 * Professional, polished design with smooth animations.
 */

let shadowHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let isMinimized = false;
let autoMinTimer: ReturnType<typeof setTimeout> | null = null;

export function injectOverlay(scanResult: any): void {
  removeOverlay();

  // Create host element
  shadowHost = document.createElement('div');
  shadowHost.id = 'trenchable-overlay-host';
  shadowHost.style.cssText = 'all: initial; position: fixed; top: 12px; right: 12px; z-index: 999999; font-family: system-ui, -apple-system, sans-serif;';
  document.body.appendChild(shadowHost);

  // Create shadow DOM for style isolation
  shadowRoot = shadowHost.attachShadow({ mode: 'closed' });

  const styles = document.createElement('style');
  styles.textContent = getOverlayStyles();
  shadowRoot.appendChild(styles);

  const container = document.createElement('div');
  container.className = 'trench-root';
  container.innerHTML = buildOverlayHTML(scanResult);
  shadowRoot.appendChild(container);

  // Wire up close button
  const closeBtn = shadowRoot.querySelector('.trench-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeOverlay();
    });
  }

  // Wire up minimize/expand toggle
  const header = shadowRoot.querySelector('.trench-header');
  if (header) {
    header.addEventListener('click', (e) => {
      // Don't toggle if they clicked close button
      if ((e.target as HTMLElement).closest('.trench-close')) return;
      toggleMinimize();
    });
  }

  // Wire up deep scan button
  const deepBtn = shadowRoot.querySelector('.trench-deep-btn');
  if (deepBtn) {
    deepBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'TRENCHABLE_GET_SCAN',
        mint: scanResult.tokenMint,
        mode: 'deep',
      });
      if (deepBtn instanceof HTMLButtonElement) {
        deepBtn.innerHTML = '<span class="trench-spinner"></span> Deep Scanning...';
        deepBtn.disabled = true;
      }
    });
  }

  // Entrance animation
  requestAnimationFrame(() => {
    const panel = shadowRoot?.querySelector('.trench-panel');
    if (panel) panel.classList.add('trench-entered');
  });

  // Auto-minimize after 8 seconds
  autoMinTimer = setTimeout(() => {
    minimize();
  }, 8_000);
}

function toggleMinimize() {
  if (isMinimized) {
    expand();
  } else {
    minimize();
  }
}

function minimize() {
  if (!shadowRoot || isMinimized) return;
  isMinimized = true;
  const panel = shadowRoot.querySelector('.trench-panel');
  if (panel) panel.classList.add('trench-minimized');
  if (autoMinTimer) {
    clearTimeout(autoMinTimer);
    autoMinTimer = null;
  }
}

function expand() {
  if (!shadowRoot || !isMinimized) return;
  isMinimized = false;
  const panel = shadowRoot.querySelector('.trench-panel');
  if (panel) panel.classList.remove('trench-minimized');
  // Re-auto-minimize after 12 seconds
  if (autoMinTimer) clearTimeout(autoMinTimer);
  autoMinTimer = setTimeout(() => minimize(), 12_000);
}

export function removeOverlay(): void {
  if (autoMinTimer) {
    clearTimeout(autoMinTimer);
    autoMinTimer = null;
  }
  if (shadowHost) {
    shadowHost.remove();
    shadowHost = null;
    shadowRoot = null;
    isMinimized = false;
  }
}

export function updateOverlay(scanResult: any): void {
  injectOverlay(scanResult);
}

function buildOverlayHTML(result: any): string {
  const { overallScore, riskLevel, tokenName, tokenSymbol, tokenImage, scanMode, scanDurationMs } = result;
  const riskColor = getRiskColor(riskLevel);
  const riskLabel = getRiskLabel(riskLevel);

  // SVG ring params (38px circle)
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const ringOffset = circumference - (overallScore / 100) * circumference;

  // Top risk flags (danger and warning), message truncated to 60 chars
  const topFlags = (result.checks || [])
    .filter((c: any) => c.status === 'danger' || c.status === 'warning')
    .sort((a: any, b: any) => {
      const order: Record<string, number> = { danger: 0, warning: 1 };
      return (order[a.status] ?? 1) - (order[b.status] ?? 1);
    })
    .slice(0, 3);

  const mc = result.mcPrediction;
  const market = result.market;
  const priceUsd = market?.priceUsd;
  const displayName = tokenSymbol || tokenName || shortenMint(result.tokenMint);

  function truncate(str: string, max: number): string {
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }

  return `
    <div class="trench-panel">
      <div class="trench-header">
        <div class="trench-header-left">
          ${tokenImage ? `<img class="trench-token-img" src="${escapeHtml(tokenImage)}" alt="" onerror="this.style.display='none'" />` : ''}
          <div class="trench-header-info">
            <div class="trench-token-name">${escapeHtml(displayName)}</div>
            <div class="trench-header-meta">
              ${priceUsd != null ? `<span class="trench-price">${formatPrice(priceUsd)}</span>` : ''}
              <span class="trench-mode-tag">${scanMode === 'deep' ? 'DEEP' : 'INSTANT'}</span>
            </div>
          </div>
        </div>
        <div class="trench-header-right">
          <svg class="trench-score-svg" width="38" height="38" viewBox="0 0 38 38">
            <circle cx="19" cy="19" r="${radius}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="4"/>
            <circle
              cx="19" cy="19" r="${radius}" fill="none"
              stroke="${riskColor}" stroke-width="4"
              stroke-linecap="round"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${ringOffset}"
              transform="rotate(-90 19 19)"
              class="trench-score-ring"
              style="filter: drop-shadow(0 0 4px ${riskColor}60)"
            />
            <text x="19" y="23" text-anchor="middle" class="trench-score-text" style="fill:${riskColor}">${overallScore}</text>
          </svg>
          <button class="trench-close" aria-label="Close">&times;</button>
        </div>
      </div>

      <div class="trench-body">
        <div class="trench-risk-bar-wrap">
          <div class="trench-risk-bar">
            <div class="trench-risk-fill" style="width: ${Math.min(overallScore, 100)}%; background: ${riskColor}"></div>
          </div>
          <div class="trench-risk-label" style="color: ${riskColor}">${riskLabel}</div>
        </div>

        ${topFlags.length > 0 ? `
          <div class="trench-flags">
            ${topFlags.map((f: any) => `
              <div class="trench-flag trench-flag--${f.status}">
                <span class="trench-flag-icon">${f.status === 'danger' ? '\u26d4' : '\u26a0\ufe0f'}</span>
                <span class="trench-flag-text">${escapeHtml(truncate(f.message, 60))}</span>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="trench-flags">
            <div class="trench-flag trench-flag--safe">
              <span class="trench-flag-icon">\u2705</span>
              <span class="trench-flag-text">No major risks detected</span>
            </div>
          </div>
        `}

        ${market?.marketCap || market?.liquidity ? `
          <div class="trench-market-row">
            ${market.marketCap ? `
              <div class="trench-stat">
                <span class="trench-stat-label">MC</span>
                <span class="trench-stat-value">$${formatNumber(market.marketCap)}</span>
              </div>
            ` : ''}
            ${market.liquidity ? `
              <div class="trench-stat">
                <span class="trench-stat-label">LIQ</span>
                <span class="trench-stat-value">$${formatNumber(market.liquidity)}</span>
              </div>
            ` : ''}
            ${market.volume24h ? `
              <div class="trench-stat">
                <span class="trench-stat-label">VOL</span>
                <span class="trench-stat-value">$${formatNumber(market.volume24h)}</span>
              </div>
            ` : ''}
            ${market.priceChange24h !== null && market.priceChange24h !== undefined ? `
              <div class="trench-stat">
                <span class="trench-stat-label">24H</span>
                <span class="trench-stat-value" style="color: ${market.priceChange24h >= 0 ? '#34d399' : '#f87171'}">
                  ${market.priceChange24h >= 0 ? '+' : ''}${market.priceChange24h.toFixed(1)}%
                </span>
              </div>
            ` : ''}
          </div>
        ` : ''}

        ${mc ? `
          <div class="trench-mc-section">
            ${mc.bondingCurve ? `
              <div class="trench-bc">
                <div class="trench-bc-header">
                  <span class="trench-bc-label">Bonding Curve</span>
                  <span class="trench-bc-pct">${mc.bondingCurve.progressPct.toFixed(0)}%</span>
                </div>
                <div class="trench-bc-track">
                  <div class="trench-bc-fill" style="width: ${Math.min(mc.bondingCurve.progressPct, 100)}%"></div>
                </div>
              </div>
            ` : ''}
            ${mc.fairValue && mc.fairValue.high > 0 ? `
              <div class="trench-mc-range">
                <span class="trench-mc-range-label">MC Range</span>
                <span class="trench-mc-range-vals">$${formatNumber(mc.fairValue.low)} — $${formatNumber(mc.fairValue.high)}</span>
              </div>
            ` : ''}
            ${mc.summary ? `<div class="trench-mc-summary">${escapeHtml(truncate(mc.summary, 100))}</div>` : ''}
          </div>
        ` : ''}

        ${scanMode === 'instant' ? `
          <button class="trench-deep-btn">Deep Scan</button>
        ` : ''}
      </div>
    </div>
  `;
}

function getRiskColor(level: string): string {
  const colors: Record<string, string> = {
    low: '#34d399',
    moderate: '#fbbf24',
    high: '#fb923c',
    critical: '#f87171',
  };
  return colors[level] || '#a78bfa';
}

function getRiskLabel(level: string): string {
  const labels: Record<string, string> = {
    low: 'LOW RISK',
    moderate: 'MODERATE RISK',
    high: 'HIGH RISK',
    critical: 'CRITICAL RISK',
  };
  return labels[level] || 'SCANNING...';
}

function formatNumber(num: number): string {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(0);
}

function formatPrice(price: number): string {
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.0001) return `$${price.toFixed(6)}`;
  return `$${price.toExponential(2)}`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shortenMint(mint: string): string {
  if (!mint || mint.length < 12) return mint || 'Unknown';
  return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
}

function getOverlayStyles(): string {
  return `
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(20px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .trench-root {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      color: #e2e8f0;
      -webkit-font-smoothing: antialiased;
    }

    .trench-panel {
      width: 340px;
      background: linear-gradient(180deg, #12121e 0%, #0d0d16 100%);
      border: 1px solid rgba(139, 92, 246, 0.2);
      border-radius: 16px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(139, 92, 246, 0.08);
      overflow: hidden;
      opacity: 0;
      transform: translateX(20px);
      transition: all 0.35s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .trench-panel.trench-entered {
      opacity: 1;
      transform: translateX(0);
    }

    /* Minimized state */
    .trench-panel.trench-minimized {
      width: auto;
      max-width: 200px;
    }
    .trench-panel.trench-minimized .trench-body,
    .trench-panel.trench-minimized .trench-footer {
      display: none;
    }
    .trench-panel.trench-minimized .trench-header {
      cursor: pointer;
    }
    .trench-panel.trench-minimized .trench-header-info {
      display: none;
    }

    /* Header */
    .trench-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 14px;
      background: rgba(255,255,255,0.02);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      cursor: pointer;
      transition: background 0.2s;
    }
    .trench-header:hover {
      background: rgba(255,255,255,0.04);
    }
    .trench-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .trench-token-img {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 2px solid rgba(139, 92, 246, 0.3);
      object-fit: cover;
      flex-shrink: 0;
    }
    .trench-header-info {
      min-width: 0;
    }
    .trench-token-name {
      font-weight: 700;
      font-size: 15px;
      color: #f1f5f9;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 160px;
    }
    .trench-header-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 2px;
    }
    .trench-mode-tag {
      background: linear-gradient(135deg, #8b5cf6, #7c3aed);
      color: #fff;
      font-size: 8px;
      padding: 1px 6px;
      border-radius: 4px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }
    .trench-scan-speed {
      font-size: 10px;
      color: #64748b;
    }

    .trench-header-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    /* SVG score ring */
    .trench-score-svg {
      flex-shrink: 0;
    }
    .trench-score-ring {
      transition: stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .trench-score-text {
      font-weight: 800;
      font-size: 11px;
      font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    }

    /* Price */
    .trench-price {
      font-size: 11px;
      font-weight: 700;
      color: #e2e8f0;
    }

    .trench-close {
      background: none;
      border: none;
      color: #475569;
      font-size: 18px;
      cursor: pointer;
      padding: 2px 4px;
      line-height: 1;
      border-radius: 4px;
      transition: all 0.15s;
    }
    .trench-close:hover {
      color: #f87171;
      background: rgba(248, 113, 113, 0.1);
    }

    /* Body */
    .trench-body {
      padding: 12px 14px;
    }

    /* Risk bar */
    .trench-risk-bar-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .trench-risk-bar {
      flex: 1;
      height: 5px;
      background: rgba(255,255,255,0.06);
      border-radius: 3px;
      overflow: hidden;
    }
    .trench-risk-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .trench-risk-label {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }

    /* Flags */
    .trench-flags {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-bottom: 10px;
    }
    .trench-flag {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      font-size: 11px;
      line-height: 1.4;
      padding: 5px 8px;
      border-radius: 8px;
      background: rgba(255,255,255,0.02);
    }
    .trench-flag--danger {
      color: #fca5a5;
      background: rgba(248, 113, 113, 0.06);
      border-left: 2px solid #f87171;
    }
    .trench-flag--warning {
      color: #fde68a;
      background: rgba(251, 191, 36, 0.06);
      border-left: 2px solid #fbbf24;
    }
    .trench-flag--safe {
      color: #a7f3d0;
      background: rgba(52, 211, 153, 0.06);
      border-left: 2px solid #34d399;
    }
    .trench-flag-icon {
      font-size: 11px;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .trench-flag-text {
      flex: 1;
    }

    /* Market stats row */
    .trench-market-row {
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
    }
    .trench-stat {
      flex: 1;
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      padding: 6px 8px;
      text-align: center;
    }
    .trench-stat-label {
      display: block;
      font-size: 9px;
      color: #64748b;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .trench-stat-value {
      font-size: 12px;
      font-weight: 700;
      color: #e2e8f0;
    }

    /* MC section */
    .trench-mc-section {
      background: rgba(139, 92, 246, 0.04);
      border: 1px solid rgba(139, 92, 246, 0.1);
      border-radius: 10px;
      padding: 10px;
      margin-bottom: 10px;
    }
    .trench-bc {
      margin-bottom: 8px;
    }
    .trench-bc-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .trench-bc-label {
      font-size: 10px;
      color: #64748b;
      font-weight: 600;
    }
    .trench-bc-pct {
      font-size: 12px;
      font-weight: 800;
      color: #a78bfa;
    }
    .trench-bc-track {
      height: 6px;
      background: rgba(255,255,255,0.06);
      border-radius: 3px;
      overflow: hidden;
    }
    .trench-bc-fill {
      height: 100%;
      background: linear-gradient(90deg, #8b5cf6, #c084fc);
      border-radius: 3px;
      transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .trench-mc-range {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .trench-mc-range-label {
      font-size: 10px;
      color: #64748b;
      font-weight: 600;
    }
    .trench-mc-range-vals {
      font-size: 11px;
      font-weight: 700;
      color: #c084fc;
    }
    .trench-mc-summary {
      font-size: 10px;
      color: #94a3b8;
      line-height: 1.5;
    }

    /* Deep scan button */
    .trench-deep-btn {
      width: 100%;
      padding: 9px;
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(139, 92, 246, 0.08));
      color: #c084fc;
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 10px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .trench-deep-btn:hover {
      background: linear-gradient(135deg, #8b5cf6, #7c3aed);
      color: #fff;
      border-color: #8b5cf6;
    }
    .trench-deep-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .trench-spinner {
      width: 12px;
      height: 12px;
      border: 2px solid rgba(192, 132, 252, 0.3);
      border-top-color: #c084fc;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

  `;
}

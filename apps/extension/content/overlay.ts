/**
 * Shadow DOM overlay injection for Trenchable scan results.
 * Shows risk score, failed checks only, and key market data.
 * Compact, actionable, dark theme with smooth animations.
 */

let shadowHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let isMinimized = false;
let autoMinTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Loading State ───

export function showOverlayLoading(mint: string): void {
  // If overlay already showing for a different mint, remove it first
  if (shadowHost) removeOverlay();

  shadowHost = document.createElement('div');
  shadowHost.id = 'trenchable-overlay-host';
  shadowHost.style.cssText = 'all: initial; position: fixed; top: 12px; right: 12px; z-index: 999999; font-family: system-ui, -apple-system, sans-serif;';
  document.body.appendChild(shadowHost);

  shadowRoot = shadowHost.attachShadow({ mode: 'closed' });

  const styles = document.createElement('style');
  styles.textContent = getOverlayStyles();
  shadowRoot.appendChild(styles);

  const container = document.createElement('div');
  container.className = 'trench-root';
  container.innerHTML = buildLoadingHTML(mint);
  shadowRoot.appendChild(container);

  // Close button
  const closeBtn = shadowRoot.querySelector('.trench-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeOverlay();
    });
  }

  requestAnimationFrame(() => {
    const panel = shadowRoot?.querySelector('.trench-panel');
    if (panel) panel.classList.add('trench-entered');
  });
}

// ─── Full Result ───

export function injectOverlay(scanResult: any): void {
  // If a loading overlay exists, just update it in place (smooth transition)
  if (!shadowHost) {
    shadowHost = document.createElement('div');
    shadowHost.id = 'trenchable-overlay-host';
    shadowHost.style.cssText = 'all: initial; position: fixed; top: 12px; right: 12px; z-index: 999999; font-family: system-ui, -apple-system, sans-serif;';
    document.body.appendChild(shadowHost);
    shadowRoot = shadowHost.attachShadow({ mode: 'closed' });

    const styles = document.createElement('style');
    styles.textContent = getOverlayStyles();
    shadowRoot.appendChild(styles);
  } else if (shadowRoot) {
    // Clear existing content except styles
    const existing = shadowRoot.querySelector('.trench-root');
    if (existing) existing.remove();
  }

  isMinimized = false;
  if (autoMinTimer) { clearTimeout(autoMinTimer); autoMinTimer = null; }

  if (!shadowRoot) return;

  const container = document.createElement('div');
  container.className = 'trench-root';
  container.innerHTML = buildOverlayHTML(scanResult);
  shadowRoot.appendChild(container);

  // Close button
  const closeBtn = shadowRoot.querySelector('.trench-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeOverlay();
    });
  }

  // Header click = minimize/expand
  const header = shadowRoot.querySelector('.trench-header');
  if (header) {
    header.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.trench-close')) return;
      toggleMinimize();
    });
  }

  // Deep scan button
  const deepBtn = shadowRoot.querySelector('.trench-deep-btn');
  if (deepBtn) {
    deepBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'TRENCHABLE_GET_SCAN',
        mint: scanResult.tokenMint,
        mode: 'deep',
      });
      if (deepBtn instanceof HTMLButtonElement) {
        deepBtn.innerHTML = '<span class="trench-spinner"></span> Scanning...';
        deepBtn.disabled = true;
      }
    });
  }

  // Entrance animation
  requestAnimationFrame(() => {
    const panel = shadowRoot?.querySelector('.trench-panel');
    if (panel) panel.classList.add('trench-entered');
  });

  // Auto-minimize after 12s
  autoMinTimer = setTimeout(() => minimize(), 12_000);
}

function toggleMinimize() {
  isMinimized ? expand() : minimize();
}

function minimize() {
  if (!shadowRoot || isMinimized) return;
  isMinimized = true;
  const panel = shadowRoot.querySelector('.trench-panel');
  if (panel) panel.classList.add('trench-minimized');
  if (autoMinTimer) { clearTimeout(autoMinTimer); autoMinTimer = null; }
}

function expand() {
  if (!shadowRoot || !isMinimized) return;
  isMinimized = false;
  const panel = shadowRoot.querySelector('.trench-panel');
  if (panel) panel.classList.remove('trench-minimized');
  if (autoMinTimer) clearTimeout(autoMinTimer);
  autoMinTimer = setTimeout(() => minimize(), 15_000);
}

export function removeOverlay(): void {
  if (autoMinTimer) { clearTimeout(autoMinTimer); autoMinTimer = null; }
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

// ─── Build Loading HTML ───

function buildLoadingHTML(mint: string): string {
  const short = mint.length > 12 ? `${mint.slice(0, 6)}...${mint.slice(-4)}` : mint;
  return `
    <div class="trench-panel">
      <div class="trench-header">
        <div class="trench-header-left">
          <div class="trench-loading-avatar"></div>
          <div class="trench-header-info">
            <div class="trench-token-name trench-skeleton" style="width:90px;height:13px;border-radius:4px"></div>
            <div class="trench-header-meta" style="margin-top:5px">
              <div class="trench-skeleton" style="width:50px;height:10px;border-radius:3px"></div>
            </div>
          </div>
        </div>
        <div class="trench-header-right">
          <div class="trench-loading-ring">
            <svg width="44" height="44" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="17" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="3.5"/>
              <circle cx="22" cy="22" r="17" fill="none" stroke="rgba(139,92,246,0.3)" stroke-width="3.5"
                stroke-dasharray="106.8" stroke-dashoffset="80" transform="rotate(-90 22 22)"
                class="trench-loading-arc"/>
            </svg>
          </div>
          <button class="trench-close" aria-label="Close">&times;</button>
        </div>
      </div>
      <div class="trench-body">
        <div class="trench-loading-status">
          <span class="trench-spinner"></span>
          <span class="trench-loading-text">Scanning ${escapeHtml(short)}...</span>
        </div>
        <div class="trench-skeleton-rows">
          <div class="trench-skeleton" style="width:100%;height:5px;border-radius:3px;margin-bottom:10px"></div>
          <div class="trench-skeleton" style="width:70%;height:10px;border-radius:3px;margin-bottom:8px"></div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px">
            ${[0,1,2,3].map(() => `<div class="trench-skeleton" style="height:40px;border-radius:6px"></div>`).join('')}
          </div>
        </div>
        <div class="trench-brand">trenchable.gold</div>
      </div>
    </div>
  `;
}

// ─── Build Result HTML ───

function buildOverlayHTML(result: any): string {
  const { overallScore, riskLevel, tokenName, tokenSymbol, tokenImage, scanMode } = result;
  const riskColor = getRiskColor(riskLevel);
  const riskLabel = getRiskLabel(riskLevel);

  // SVG ring
  const radius = 17;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (overallScore / 100) * circ;

  // Only failed checks (danger + warning)
  const checks = result.checks || [];
  const failedChecks = checks
    .filter((c: any) => c.status === 'danger' || c.status === 'warning')
    .sort((a: any, b: any) => {
      if (a.status === 'danger' && b.status !== 'danger') return -1;
      if (a.status !== 'danger' && b.status === 'danger') return 1;
      return (b.score || 0) - (a.score || 0);
    });

  const passedCount = checks.filter((c: any) => c.status === 'safe').length;
  const totalChecks = checks.length;

  const mc = result.mcPrediction;
  const market = result.market;
  const priceUsd = market?.priceUsd;
  const displayName = tokenSymbol || tokenName || shortenMint(result.tokenMint);

  return `
    <div class="trench-panel">

      <!-- HEADER -->
      <div class="trench-header">
        <div class="trench-header-left">
          ${tokenImage
            ? `<img class="trench-token-img" src="${escapeHtml(tokenImage)}" alt="" onerror="this.style.display='none'" />`
            : `<div class="trench-token-placeholder">${escapeHtml((displayName || '?')[0].toUpperCase())}</div>`
          }
          <div class="trench-header-info">
            <div class="trench-token-name">${escapeHtml(displayName)}</div>
            <div class="trench-header-meta">
              ${priceUsd != null ? `<span class="trench-price">${formatPrice(priceUsd)}</span>` : ''}
              <span class="trench-mode-tag trench-mode--${scanMode}">${scanMode === 'deep' ? 'DEEP' : 'INSTANT'}</span>
            </div>
          </div>
        </div>
        <div class="trench-header-right">
          <div class="trench-score-wrap" title="${riskLabel}">
            <svg class="trench-score-svg" width="44" height="44" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="${radius}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="3.5"/>
              <circle cx="22" cy="22" r="${radius}" fill="none"
                stroke="${riskColor}" stroke-width="3.5" stroke-linecap="round"
                stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
                transform="rotate(-90 22 22)" class="trench-score-ring"
                style="filter: drop-shadow(0 0 6px ${riskColor}40)"/>
              <text x="22" y="26" text-anchor="middle" class="trench-score-text" style="fill:${riskColor}">${overallScore}</text>
            </svg>
          </div>
          <button class="trench-close" aria-label="Close">&times;</button>
        </div>
      </div>

      <!-- BODY -->
      <div class="trench-body">

        <!-- Risk bar + label -->
        <div class="trench-risk-bar-wrap">
          <div class="trench-risk-bar">
            <div class="trench-risk-fill" style="width: ${Math.min(overallScore, 100)}%; background: linear-gradient(90deg, ${riskColor}99, ${riskColor})"></div>
          </div>
          <div class="trench-risk-label" style="color: ${riskColor}">${riskLabel}</div>
        </div>

        <!-- Summary line -->
        <div class="trench-summary">
          ${failedChecks.length > 0
            ? `<span class="trench-summary-bad">${failedChecks.length} issue${failedChecks.length > 1 ? 's' : ''} found</span>`
            : `<span class="trench-summary-good">✓ All ${totalChecks} checks passed</span>`
          }
          ${passedCount > 0 && failedChecks.length > 0
            ? `<span class="trench-summary-pass">${passedCount}/${totalChecks} passed</span>`
            : ''
          }
        </div>

        <!-- Failed checks only -->
        ${failedChecks.length > 0 ? `
          <div class="trench-flags">
            ${failedChecks.map((c: any) => renderFlag(c)).join('')}
          </div>
        ` : ''}

        <!-- Market stats -->
        ${market?.marketCap || market?.liquidity ? `
          <div class="trench-market-grid">
            ${market.marketCap ? `
              <div class="trench-stat">
                <span class="trench-stat-label">MCAP</span>
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
            ${market.priceChange24h != null ? `
              <div class="trench-stat">
                <span class="trench-stat-label">24H</span>
                <span class="trench-stat-value" style="color: ${market.priceChange24h >= 0 ? '#34d399' : '#f87171'}">
                  ${market.priceChange24h >= 0 ? '+' : ''}${market.priceChange24h.toFixed(1)}%
                </span>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- Bonding curve -->
        ${mc?.bondingCurve ? `
          <div class="trench-bc">
            <div class="trench-bc-row">
              <span class="trench-bc-label">Bonding Curve</span>
              <span class="trench-bc-pct">${mc.bondingCurve.progressPct.toFixed(0)}%</span>
            </div>
            <div class="trench-bc-track">
              <div class="trench-bc-fill" style="width: ${Math.min(mc.bondingCurve.progressPct, 100)}%"></div>
            </div>
            ${mc.bondingCurve.remainingToGraduateSol ? `
              <div class="trench-bc-sub">${mc.bondingCurve.remainingToGraduateSol.toFixed(1)} SOL to graduate</div>
            ` : ''}
          </div>
        ` : ''}

        <!-- MC prediction (only if meaningful data) -->
        ${mc?.fairValue && mc.fairValue.high > 0 ? `
          <div class="trench-mc">
            <div class="trench-mc-row">
              <span class="trench-mc-label">MC Range</span>
              ${mc.confidence ? `<span class="trench-mc-conf trench-mc-conf--${mc.confidence}">${mc.confidence}</span>` : ''}
            </div>
            <div class="trench-mc-vals">
              $${formatNumber(mc.fairValue.low)} — <strong>$${formatNumber(mc.fairValue.mid)}</strong> — $${formatNumber(mc.fairValue.high)}
            </div>
          </div>
        ` : ''}

        <!-- Deep scan button -->
        ${scanMode === 'instant' ? `
          <button class="trench-deep-btn">⚡ Deep Scan</button>
        ` : ''}

        <div class="trench-brand">trenchable.gold</div>
      </div>
    </div>
  `;
}

// ─── Render a failed check flag ───

function renderFlag(check: any): string {
  const isDanger = check.status === 'danger';
  const name = formatCheckName(check.check || '');
  const msg = check.message || '';
  const details = check.details || {};
  const chips = buildDetailChips(check.check, details);

  return `
    <div class="trench-flag trench-flag--${check.status}">
      <div class="trench-flag-top">
        <span class="trench-flag-icon">${isDanger ? '⛔' : '⚠️'}</span>
        <span class="trench-flag-name">${escapeHtml(name)}</span>
        ${check.score != null ? `<span class="trench-flag-score trench-flag-score--${check.status}">${check.score}</span>` : ''}
      </div>
      <div class="trench-flag-msg">${escapeHtml(msg)}</div>
      ${chips.length > 0 ? `
        <div class="trench-flag-chips">
          ${chips.map(c => `<span class="trench-chip">${escapeHtml(c)}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function buildDetailChips(checkType: string, details: any): string[] {
  const chips: string[] = [];
  if (!details || typeof details !== 'object') return chips;
  switch (checkType) {
    case 'TOP_HOLDERS':
      if (details.topHolderPct != null) chips.push(`Top holder: ${details.topHolderPct.toFixed(1)}%`);
      if (details.holderCount != null) chips.push(`${details.holderCount} holders`);
      break;
    case 'DEV_WALLET':
      if (details.devHoldingPct != null) chips.push(`Dev holds: ${details.devHoldingPct.toFixed(1)}%`);
      break;
    case 'TOKEN_TAX':
      if (details.buyTax != null) chips.push(`Buy tax: ${details.buyTax}%`);
      if (details.sellTax != null) chips.push(`Sell tax: ${details.sellTax}%`);
      break;
    case 'LP_STATUS':
      if (details.lpLockedPct != null) chips.push(`LP locked: ${details.lpLockedPct.toFixed(0)}%`);
      if (details.lpBurnedPct != null) chips.push(`LP burned: ${details.lpBurnedPct.toFixed(0)}%`);
      break;
    case 'HONEYPOT':
      if (details.isHoneypot) chips.push('HONEYPOT DETECTED');
      break;
    case 'BUNDLE_DETECTION':
      if (details.bundleCount != null) chips.push(`${details.bundleCount} bundles`);
      break;
    case 'SNIPER_BOTS':
      if (details.sniperCount != null) chips.push(`${details.sniperCount} snipers`);
      break;
  }
  return chips;
}

function formatCheckName(check: string): string {
  const names: Record<string, string> = {
    'MINT_AUTHORITY': 'Mint Authority',
    'FREEZE_AUTHORITY': 'Freeze Authority',
    'LP_STATUS': 'LP Status',
    'TOP_HOLDERS': 'Top Holders',
    'BUNDLE_DETECTION': 'Bundle Detection',
    'DEV_WALLET': 'Dev Wallet',
    'HONEYPOT': 'Honeypot',
    'WALLET_CLUSTER': 'Wallet Cluster',
    'SOCIAL_SENTIMENT': 'Social Sentiment',
    'RUG_PATTERN': 'Rug Pattern',
    'TOKEN_TAX': 'Token Tax',
    'SNIPER_BOTS': 'Sniper Bots',
  };
  return names[check] || check.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function getRiskColor(level: string): string {
  return ({ low: '#34d399', moderate: '#fbbf24', high: '#fb923c', critical: '#ef4444' })[level] || '#a78bfa';
}

function getRiskLabel(level: string): string {
  return ({ low: 'LOW RISK', moderate: 'MODERATE', high: 'HIGH RISK', critical: 'CRITICAL' })[level] || 'SCANNING...';
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
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shortenMint(mint: string): string {
  if (!mint || mint.length < 12) return mint || 'Unknown';
  return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
}

// ─── Styles ───

function getOverlayStyles(): string {
  return `
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulseGlow {
      0%, 100% { box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
      50% { box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 14px 3px rgba(139, 92, 246, 0.15); }
    }
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes arcSpin {
      to { transform: rotate(360deg); transform-origin: 22px 22px; }
    }

    .trench-root {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      color: #e2e8f0;
      -webkit-font-smoothing: antialiased;
    }

    .trench-panel {
      width: 320px;
      background: linear-gradient(180deg, #13131f 0%, #0d0d18 100%);
      border: 1px solid rgba(139, 92, 246, 0.18);
      border-radius: 14px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04);
      overflow: hidden;
      opacity: 0;
      transform: translateX(24px);
      transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .trench-panel.trench-entered {
      opacity: 1;
      transform: translateX(0);
    }

    /* Minimized */
    .trench-panel.trench-minimized {
      width: auto;
      max-width: 160px;
      animation: pulseGlow 3s ease-in-out infinite;
    }
    .trench-panel.trench-minimized .trench-body { display: none; }
    .trench-panel.trench-minimized .trench-header-info { display: none; }
    .trench-panel.trench-minimized .trench-loading-avatar { display: none; }
    .trench-panel.trench-minimized .trench-token-placeholder { display: none; }

    /* ─── Header ─── */
    .trench-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      background: rgba(255,255,255,0.012);
      border-bottom: 1px solid rgba(255,255,255,0.05);
      cursor: pointer;
      transition: background 0.15s;
      user-select: none;
    }
    .trench-header:hover { background: rgba(255,255,255,0.025); }

    .trench-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1;
    }
    .trench-token-img {
      width: 32px; height: 32px;
      border-radius: 50%;
      border: 1.5px solid rgba(139, 92, 246, 0.35);
      object-fit: cover;
      flex-shrink: 0;
    }
    .trench-token-placeholder {
      width: 32px; height: 32px;
      border-radius: 50%;
      border: 1.5px solid rgba(139, 92, 246, 0.35);
      background: rgba(139, 92, 246, 0.12);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 800;
      color: #a78bfa;
      flex-shrink: 0;
    }
    .trench-loading-avatar {
      width: 32px; height: 32px;
      border-radius: 50%;
      flex-shrink: 0;
      background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
    }
    .trench-header-info {
      min-width: 0;
      flex: 1;
    }
    .trench-token-name {
      font-weight: 700;
      font-size: 13px;
      color: #f1f5f9;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 140px;
    }
    .trench-header-meta {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-top: 2px;
    }
    .trench-price {
      font-size: 11px;
      font-weight: 600;
      color: #94a3b8;
    }
    .trench-mode-tag {
      font-size: 7px;
      padding: 1px 5px;
      border-radius: 3px;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #fff;
      text-transform: uppercase;
    }
    .trench-mode--instant { background: #7c3aed; }
    .trench-mode--deep { background: #0891b2; }

    .trench-header-right {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .trench-score-wrap { position: relative; }
    .trench-score-svg { flex-shrink: 0; display: block; }
    .trench-score-ring {
      transition: stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .trench-score-text {
      font-weight: 800;
      font-size: 13px;
      font-family: inherit;
    }

    /* Loading ring arc animation */
    .trench-loading-ring svg { display: block; }
    .trench-loading-arc {
      transform-origin: 22px 22px;
      animation: arcSpin 1s linear infinite;
    }

    .trench-close {
      background: none;
      border: none;
      color: #475569;
      font-size: 18px;
      cursor: pointer;
      padding: 1px 5px;
      line-height: 1;
      border-radius: 4px;
      transition: all 0.15s;
      flex-shrink: 0;
    }
    .trench-close:hover {
      color: #f87171;
      background: rgba(248, 113, 113, 0.1);
    }

    /* ─── Body ─── */
    .trench-body { padding: 10px 12px 8px; }

    /* Loading state */
    .trench-loading-status {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 10px;
      padding: 7px 8px;
      background: rgba(139,92,246,0.06);
      border-radius: 7px;
      border: 1px solid rgba(139,92,246,0.1);
    }
    .trench-loading-text {
      font-size: 11px;
      color: #94a3b8;
      font-weight: 500;
    }
    .trench-skeleton {
      background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.04) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      display: block;
    }
    .trench-skeleton-rows {}

    /* Risk bar */
    .trench-risk-bar-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 7px;
    }
    .trench-risk-bar {
      flex: 1;
      height: 4px;
      background: rgba(255,255,255,0.06);
      border-radius: 2px;
      overflow: hidden;
    }
    .trench-risk-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .trench-risk-label {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }

    /* Summary line */
    .trench-summary {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      padding: 0 1px;
    }
    .trench-summary-bad {
      font-size: 11px;
      font-weight: 700;
      color: #f87171;
    }
    .trench-summary-good {
      font-size: 11px;
      font-weight: 700;
      color: #34d399;
    }
    .trench-summary-pass {
      font-size: 10px;
      color: #475569;
    }

    /* ─── Failed check flags ─── */
    .trench-flags {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 10px;
      max-height: 180px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(139,92,246,0.2) transparent;
    }
    .trench-flags::-webkit-scrollbar { width: 3px; }
    .trench-flags::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.25); border-radius: 2px; }

    .trench-flag {
      padding: 6px 8px;
      border-radius: 7px;
      border-left: 3px solid transparent;
    }
    .trench-flag--danger {
      background: rgba(248,113,113,0.07);
      border-left-color: #f87171;
    }
    .trench-flag--warning {
      background: rgba(251,191,36,0.07);
      border-left-color: #fbbf24;
    }

    .trench-flag-top {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .trench-flag-icon {
      font-size: 11px;
      flex-shrink: 0;
    }
    .trench-flag-name {
      font-size: 11px;
      font-weight: 700;
      flex: 1;
    }
    .trench-flag--danger .trench-flag-name { color: #fca5a5; }
    .trench-flag--warning .trench-flag-name { color: #fde68a; }

    .trench-flag-score {
      font-size: 9px;
      font-weight: 800;
      padding: 1px 5px;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .trench-flag-score--danger {
      background: rgba(248,113,113,0.15);
      color: #f87171;
    }
    .trench-flag-score--warning {
      background: rgba(251,191,36,0.15);
      color: #fbbf24;
    }

    .trench-flag-msg {
      font-size: 10px;
      color: #94a3b8;
      margin-top: 2px;
      padding-left: 16px;
      line-height: 1.4;
    }
    .trench-flag-chips {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      margin-top: 3px;
      padding-left: 16px;
    }
    .trench-chip {
      font-size: 9px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 3px;
      background: rgba(255,255,255,0.06);
      color: #cbd5e1;
      white-space: nowrap;
    }

    /* ─── Market grid ─── */
    .trench-market-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      margin-bottom: 8px;
    }
    .trench-stat {
      background: rgba(255,255,255,0.025);
      border: 1px solid rgba(255,255,255,0.04);
      border-radius: 6px;
      padding: 5px 4px;
      text-align: center;
    }
    .trench-stat-label {
      display: block;
      font-size: 8px;
      color: #475569;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
      text-transform: uppercase;
    }
    .trench-stat-value {
      font-size: 11px;
      font-weight: 700;
      color: #e2e8f0;
    }

    /* ─── Bonding curve ─── */
    .trench-bc {
      background: rgba(139, 92, 246, 0.04);
      border: 1px solid rgba(139, 92, 246, 0.1);
      border-radius: 8px;
      padding: 6px 8px;
      margin-bottom: 8px;
    }
    .trench-bc-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .trench-bc-label {
      font-size: 10px;
      color: #94a3b8;
      font-weight: 600;
    }
    .trench-bc-pct {
      font-size: 12px;
      font-weight: 800;
      color: #a78bfa;
    }
    .trench-bc-track {
      height: 5px;
      background: rgba(255,255,255,0.06);
      border-radius: 3px;
      overflow: hidden;
    }
    .trench-bc-fill {
      height: 100%;
      background: linear-gradient(90deg, #8b5cf6, #c084fc);
      border-radius: 3px;
      transition: width 0.8s ease;
    }
    .trench-bc-sub {
      font-size: 9px;
      color: #475569;
      margin-top: 3px;
      text-align: right;
    }

    /* ─── MC prediction ─── */
    .trench-mc {
      background: rgba(139, 92, 246, 0.04);
      border: 1px solid rgba(139, 92, 246, 0.1);
      border-radius: 8px;
      padding: 6px 8px;
      margin-bottom: 8px;
    }
    .trench-mc-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3px;
    }
    .trench-mc-label {
      font-size: 10px;
      color: #94a3b8;
      font-weight: 600;
    }
    .trench-mc-conf {
      font-size: 8px;
      font-weight: 800;
      padding: 1px 5px;
      border-radius: 3px;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }
    .trench-mc-conf--low { background: rgba(100,116,139,0.2); color: #94a3b8; }
    .trench-mc-conf--medium { background: rgba(251,191,36,0.15); color: #fbbf24; }
    .trench-mc-conf--high { background: rgba(52,211,153,0.15); color: #34d399; }
    .trench-mc-vals {
      font-size: 11px;
      color: #a78bfa;
      text-align: center;
    }
    .trench-mc-vals strong {
      color: #c084fc;
      font-weight: 800;
    }

    /* ─── Deep scan button ─── */
    .trench-deep-btn {
      width: 100%;
      padding: 8px;
      background: rgba(139, 92, 246, 0.07);
      color: #a78bfa;
      border: 1px solid rgba(139, 92, 246, 0.18);
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      margin-bottom: 6px;
      letter-spacing: 0.2px;
    }
    .trench-deep-btn:hover {
      background: linear-gradient(135deg, #8b5cf6, #7c3aed);
      color: #fff;
      border-color: transparent;
      box-shadow: 0 4px 16px rgba(139,92,246,0.3);
    }
    .trench-deep-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .trench-spinner {
      display: inline-block;
      width: 11px; height: 11px;
      border: 2px solid rgba(192,132,252,0.3);
      border-top-color: #c084fc;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      flex-shrink: 0;
    }

    .trench-brand {
      text-align: center;
      font-size: 8px;
      color: #1e293b;
      font-weight: 600;
      letter-spacing: 0.5px;
      padding-top: 2px;
    }
  `;
}

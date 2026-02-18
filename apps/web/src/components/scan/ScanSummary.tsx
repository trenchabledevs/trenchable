import type { ScanResponse } from '@trenchable/shared';
import { CopyButton } from '../common/CopyButton';
import { shortenAddress } from '../../lib/format';
import { Clock, Zap, Globe, ExternalLink, DollarSign, TrendingUp, TrendingDown, BarChart3, Droplets, ShieldCheck, ShieldAlert } from 'lucide-react';

function formatUsd(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.0001) return `$${value.toFixed(6)}`;
  return `$${value.toExponential(2)}`;
}

function formatAge(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(ms / 60_000)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  return `${Math.round(days / 30)}mo`;
}

export function ScanSummary({ scan }: { scan: ScanResponse }) {
  const market = scan.market;
  const priceChange = market?.priceChange24h;
  const isPositive = priceChange != null && priceChange > 0;
  const isNegative = priceChange != null && priceChange < 0;

  return (
    <div className="bg-bg-card border border-border rounded-xl p-5">
      {/* Token identity */}
      <div className="flex items-start gap-4 mb-5">
        {/* Token image */}
        {scan.tokenImage ? (
          <img
            src={scan.tokenImage}
            alt={scan.tokenName || 'Token'}
            className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-border"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-bg border border-border flex items-center justify-center flex-shrink-0">
            <span className="text-2xl font-bold text-text-muted">
              {scan.tokenSymbol?.[0] || '?'}
            </span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-text">
              {scan.tokenName || 'Unknown Token'}
            </h2>
            {scan.tokenSymbol && (
              <span className="px-2 py-0.5 bg-accent/10 text-accent text-sm font-semibold rounded-md">
                ${scan.tokenSymbol}
              </span>
            )}
            {scan.externalRisk?.rugcheckVerified && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-safe/10 text-safe text-xs font-semibold rounded-md border border-safe/20">
                <ShieldCheck size={12} /> Verified
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <code className="text-sm font-mono text-text-muted">
              {shortenAddress(scan.tokenMint, 6)}
            </code>
            <CopyButton text={scan.tokenMint} />
            {market?.dexUrl && (
              <a
                href={market.dexUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-muted hover:text-accent transition-colors"
              >
                <ExternalLink size={14} />
              </a>
            )}
          </div>
          {scan.tokenDescription && (
            <p className="text-xs text-text-dim mt-2 line-clamp-2">{scan.tokenDescription}</p>
          )}
        </div>

        {/* Price (top right) */}
        {market?.priceUsd != null && (
          <div className="text-right flex-shrink-0">
            <div className="text-lg font-bold text-text">{formatUsd(market.priceUsd)}</div>
            {priceChange != null && (
              <div className={`flex items-center justify-end gap-1 text-sm font-semibold ${isPositive ? 'text-safe' : isNegative ? 'text-critical' : 'text-text-muted'}`}>
                {isPositive ? <TrendingUp size={14} /> : isNegative ? <TrendingDown size={14} /> : null}
                {isPositive ? '+' : ''}{priceChange.toFixed(2)}%
                <span className="text-text-muted font-normal text-xs">24h</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Market data row */}
      {market && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-bg rounded-lg px-3 py-2">
            <div className="text-xs text-text-muted flex items-center gap-1">
              <DollarSign size={11} /> Market Cap
            </div>
            <div className="text-sm font-semibold text-text">{formatUsd(market.marketCap)}</div>
          </div>
          <div className="bg-bg rounded-lg px-3 py-2">
            <div className="text-xs text-text-muted flex items-center gap-1">
              <Droplets size={11} /> Liquidity
            </div>
            <div className="text-sm font-semibold text-text">{formatUsd(market.liquidity)}</div>
          </div>
          <div className="bg-bg rounded-lg px-3 py-2">
            <div className="text-xs text-text-muted flex items-center gap-1">
              <BarChart3 size={11} /> Volume 24h
            </div>
            <div className="text-sm font-semibold text-text">{formatUsd(market.volume24h)}</div>
          </div>
          <div className="bg-bg rounded-lg px-3 py-2">
            <div className="text-xs text-text-muted flex items-center gap-1">
              <Clock size={11} /> Age
            </div>
            <div className="text-sm font-semibold text-text">{formatAge(market.pairAge)}</div>
          </div>
        </div>
      )}

      {/* External risk flags */}
      {scan.externalRisk && (scan.externalRisk.goPlusFlags.length > 0 || scan.externalRisk.rugcheckFlags.length > 0) && (
        <div className="bg-critical/5 border border-critical/20 rounded-lg px-3 py-2.5 mb-4">
          <div className="flex items-center gap-1.5 text-critical text-xs font-semibold mb-1.5">
            <ShieldAlert size={13} />
            External Security Alerts
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[...scan.externalRisk.goPlusFlags, ...scan.externalRisk.rugcheckFlags].slice(0, 6).map((flag, i) => (
              <span key={i} className="px-2 py-0.5 bg-critical/10 text-critical text-xs rounded-md border border-critical/20">
                {flag}
              </span>
            ))}
            {scan.externalRisk.goPlusFlags.length + scan.externalRisk.rugcheckFlags.length > 6 && (
              <span className="px-2 py-0.5 text-critical text-xs">
                +{scan.externalRisk.goPlusFlags.length + scan.externalRisk.rugcheckFlags.length - 6} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Trust signals */}
      {scan.externalRisk && scan.externalRisk.goPlusTrust.length > 0 && (
        <div className="bg-safe/5 border border-safe/20 rounded-lg px-3 py-2 mb-4">
          <div className="flex flex-wrap gap-1.5">
            {scan.externalRisk.goPlusTrust.map((signal, i) => (
              <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-safe/10 text-safe text-xs rounded-md border border-safe/20">
                <ShieldCheck size={11} /> {signal}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-text-dim">
          <Globe size={14} />
          <span className="capitalize">{scan.platform}</span>
        </div>
        <div className="flex items-center gap-1.5 text-text-dim">
          <Zap size={14} />
          <span>{scan.scanDurationMs}ms</span>
        </div>
        <div className="flex items-center gap-1.5 text-text-dim">
          <Clock size={14} />
          <span>{new Date(scan.scanTimestamp).toLocaleTimeString()}</span>
        </div>
        {market?.txns24h && (
          <div className="flex items-center gap-1.5 text-text-dim">
            <BarChart3 size={14} />
            <span className="text-safe">{market.txns24h.buys} buys</span>
            <span>/</span>
            <span className="text-critical">{market.txns24h.sells} sells</span>
            <span className="text-text-muted text-xs">24h</span>
          </div>
        )}
      </div>

      {/* Social links */}
      {(scan.socials.length > 0 || scan.websites.length > 0) && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
          {scan.websites.map((url, i) => (
            <a
              key={`w-${i}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1 bg-bg rounded-lg text-xs text-text-dim hover:text-accent transition-colors border border-border hover:border-accent/30"
            >
              <Globe size={12} /> Website
            </a>
          ))}
          {scan.socials.map((social, i) => (
            <a
              key={`s-${i}`}
              href={social.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1 bg-bg rounded-lg text-xs text-text-dim hover:text-accent transition-colors border border-border hover:border-accent/30 capitalize"
            >
              <ExternalLink size={12} /> {social.type}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

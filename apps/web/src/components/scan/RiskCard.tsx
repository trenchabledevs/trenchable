import type { RiskCheckResult } from '@trenchable/shared';
import { StatusBadge } from '../common/StatusBadge';
import { getRiskColor } from '../../lib/format';
import {
  Shield, Snowflake, Droplets, Users, Package, Wallet, Bug,
  Network, MessageSquare, AlertOctagon, Receipt, Crosshair,
} from 'lucide-react';

const checkIcons: Record<string, typeof Shield> = {
  MINT_AUTHORITY: Shield, FREEZE_AUTHORITY: Snowflake, LP_STATUS: Droplets,
  TOP_HOLDERS: Users, BUNDLE_DETECTION: Package, DEV_WALLET: Wallet,
  HONEYPOT: Bug, WALLET_CLUSTER: Network, SOCIAL_SENTIMENT: MessageSquare,
  RUG_PATTERN: AlertOctagon, TOKEN_TAX: Receipt, SNIPER_BOTS: Crosshair,
};

const checkLabels: Record<string, string> = {
  MINT_AUTHORITY: 'Mint Authority', FREEZE_AUTHORITY: 'Freeze Authority',
  LP_STATUS: 'LP Status', TOP_HOLDERS: 'Top Holders',
  BUNDLE_DETECTION: 'Bundle Detection', DEV_WALLET: 'Dev Wallet',
  HONEYPOT: 'Honeypot Check', WALLET_CLUSTER: 'Wallet Clustering',
  SOCIAL_SENTIMENT: 'Social Sentiment', RUG_PATTERN: 'Rug Patterns',
  TOKEN_TAX: 'Token Tax/Fees', SNIPER_BOTS: 'Sniper Bots',
};

export function RiskCard({ result }: { result: RiskCheckResult }) {
  const Icon = checkIcons[result.check] || Shield;
  const label = checkLabels[result.check] || result.check;
  const color = getRiskColor(result.score);

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 hover:border-border-hover transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${color}15` }}
          >
            <Icon size={18} style={{ color }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text">{label}</h3>
            <span className="text-xs text-text-muted">Risk: {result.score}/100</span>
          </div>
        </div>
        <StatusBadge status={result.status} />
      </div>

      {/* Score bar */}
      <div className="w-full h-1.5 bg-border rounded-full mb-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${result.score}%`,
            backgroundColor: color,
          }}
        />
      </div>

      <p className="text-sm text-text-dim leading-relaxed">{String(result.message)}</p>

      {/* Details (expandable in future) */}
      {result.check === 'TOP_HOLDERS' && Array.isArray(result.details.holders) && (
        <div className="mt-3 space-y-1">
          {(result.details.holders as { address: string; percentage: number }[])
            .slice(0, 5)
            .map((h, i) => (
              <div key={i} className="flex justify-between text-xs font-mono">
                <span className="text-text-muted">
                  {h.address.slice(0, 4)}...{h.address.slice(-4)}
                </span>
                <span className="text-text-dim">{h.percentage}%</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

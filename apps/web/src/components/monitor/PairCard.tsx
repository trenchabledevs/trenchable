import type { NewPairEvent } from '@trenchable/shared';
import { shortenAddress, formatTimestamp } from '../../lib/format';
import { CopyButton } from '../common/CopyButton';
import { ExternalLink } from 'lucide-react';

interface PairCardProps {
  pair: NewPairEvent;
  onScan: (mint: string) => void;
}

const platformColors: Record<string, string> = {
  'pump.fun': '#00d18c',
  raydium: '#5ac4be',
  meteora: '#f5c542',
  unknown: '#71717a',
};

export function PairCard({ pair, onScan }: PairCardProps) {
  const platformColor = platformColors[pair.platform] || platformColors.unknown;

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 hover:border-border-hover transition-all">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="px-2 py-0.5 rounded-md text-xs font-bold"
            style={{
              color: platformColor,
              backgroundColor: `${platformColor}15`,
            }}
          >
            {pair.platform}
          </span>
          <span className="text-xs text-text-muted">
            {formatTimestamp(pair.timestamp)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <h3 className="font-semibold text-text">
          {pair.tokenName || 'New Token'}
        </h3>
        {pair.tokenSymbol && (
          <span className="text-text-dim text-sm">${pair.tokenSymbol}</span>
        )}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <code className="text-xs font-mono text-text-muted">
          {shortenAddress(pair.tokenMint, 6)}
        </code>
        <CopyButton text={pair.tokenMint} />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onScan(pair.tokenMint)}
          className="flex-1 py-2 bg-accent/15 hover:bg-accent/25 text-accent font-semibold text-sm rounded-lg transition-colors cursor-pointer"
        >
          Quick Scan
        </button>
        <a
          href={`https://solscan.io/token/${pair.tokenMint}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 bg-bg-card-hover rounded-lg hover:bg-border transition-colors"
        >
          <ExternalLink size={16} className="text-text-dim" />
        </a>
      </div>
    </div>
  );
}

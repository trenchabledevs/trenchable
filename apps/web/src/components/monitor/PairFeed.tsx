import type { NewPairEvent } from '@trenchable/shared';
import { PairCard } from './PairCard';

interface PairFeedProps {
  pairs: NewPairEvent[];
  onScan: (mint: string) => void;
}

export function PairFeed({ pairs, onScan }: PairFeedProps) {
  if (pairs.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">&#x1F4E1;</div>
        <h3 className="text-lg font-semibold text-text mb-2">Listening for new pairs...</h3>
        <p className="text-text-dim text-sm max-w-sm mx-auto">
          New token pairs from pump.fun and Raydium will appear here in real-time.
          Make sure your RPC supports WebSocket connections.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {pairs.map((pair, i) => (
        <PairCard key={`${pair.tokenMint}-${pair.timestamp}-${i}`} pair={pair} onScan={onScan} />
      ))}
    </div>
  );
}

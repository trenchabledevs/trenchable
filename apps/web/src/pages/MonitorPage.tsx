import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';
import { PairFeed } from '../components/monitor/PairFeed';
import { Radio, Wifi, WifiOff, Trash2 } from 'lucide-react';

export function MonitorPage() {
  const navigate = useNavigate();
  const { pairs, connected, clearPairs } = useWebSocket();

  const handleScan = (mint: string) => {
    navigate(`/scan/${mint}`);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Radio size={24} className="text-accent" />
            <h1 className="text-2xl font-bold">Live Pair Monitor</h1>
          </div>
          <p className="text-text-dim text-sm">
            Real-time feed of new token pairs on pump.fun and Raydium
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              connected
                ? 'bg-safe/10 text-safe border-safe/30'
                : 'bg-critical/10 text-critical border-critical/30'
            }`}
          >
            {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {connected ? 'Connected' : 'Disconnected'}
          </div>

          {/* Clear button */}
          {pairs.length > 0 && (
            <button
              onClick={clearPairs}
              className="flex items-center gap-2 px-3 py-1.5 bg-bg-card border border-border rounded-lg text-xs font-medium text-text-dim hover:text-text hover:border-border-hover transition-colors cursor-pointer"
            >
              <Trash2 size={12} />
              Clear ({pairs.length})
            </button>
          )}
        </div>
      </div>

      {/* Feed */}
      <PairFeed pairs={pairs} onScan={handleScan} />
    </div>
  );
}

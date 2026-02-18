import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  getWatchlist,
  removeFromWatchlist,
  rescanAllWatchlist,
} from '../lib/api';
import { shortenAddress, getRiskColor, getRiskLabel } from '../lib/format';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { Eye, Trash2, RefreshCw, TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react';

export function WatchlistPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: watchlist, isLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: getWatchlist,
    refetchInterval: 30_000,
  });

  const removeMutation = useMutation({
    mutationFn: removeFromWatchlist,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  });

  const rescanMutation = useMutation({
    mutationFn: rescanAllWatchlist,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
  });

  function getScoreTrend(current: number, previous: number | null) {
    if (previous === null) return { icon: Minus, label: 'New', color: 'text-text-muted' };
    const diff = current - previous;
    if (diff > 5) return { icon: TrendingUp, label: `+${diff}`, color: 'text-critical' };
    if (diff < -5) return { icon: TrendingDown, label: `${diff}`, color: 'text-safe' };
    return { icon: Minus, label: 'Stable', color: 'text-text-muted' };
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Eye size={24} className="text-accent" />
            <h1 className="text-2xl font-bold">Watchlist</h1>
          </div>
          <p className="text-text-dim text-sm">
            Track tokens and auto-rescan every 5 minutes
          </p>
        </div>

        {watchlist && watchlist.length > 0 && (
          <button
            onClick={() => rescanMutation.mutate()}
            disabled={rescanMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dim disabled:opacity-40 text-white font-semibold rounded-xl transition-colors cursor-pointer text-sm"
          >
            {rescanMutation.isPending ? (
              <LoadingSpinner size={14} />
            ) : (
              <RefreshCw size={14} />
            )}
            Rescan All
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-16"><LoadingSpinner size={32} /></div>
      )}

      {!isLoading && (!watchlist || watchlist.length === 0) && (
        <div className="text-center py-16">
          <Eye size={48} className="mx-auto text-text-muted mb-4" />
          <h3 className="text-lg font-semibold text-text mb-2">Watchlist is empty</h3>
          <p className="text-text-dim text-sm mb-4">Scan a token and add it to your watchlist to track risk changes</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-accent hover:bg-accent-dim text-white font-semibold rounded-xl transition-colors cursor-pointer text-sm"
          >
            Scan a Token
          </button>
        </div>
      )}

      {watchlist && watchlist.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {watchlist.map((entry) => {
            const color = getRiskColor(entry.latestScore);
            const trend = getScoreTrend(entry.latestScore, entry.previousScore);
            const TrendIcon = trend.icon;

            return (
              <div
                key={entry.id}
                className="bg-bg-card border border-border rounded-xl p-5 hover:border-border-hover transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-text">
                      {entry.tokenName || 'Unknown'}
                    </h3>
                    {entry.tokenSymbol && (
                      <span className="text-text-dim text-sm">${entry.tokenSymbol}</span>
                    )}
                    <div className="mt-1">
                      <code className="text-xs font-mono text-text-muted">
                        {shortenAddress(entry.tokenMint, 4)}
                      </code>
                    </div>
                  </div>
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold border-2"
                    style={{ color, borderColor: `${color}40`, backgroundColor: `${color}10` }}
                  >
                    {entry.latestScore}
                  </div>
                </div>

                {/* Trend */}
                <div className="flex items-center gap-2 mb-3">
                  <TrendIcon size={14} className={trend.color} />
                  <span className={`text-xs font-medium ${trend.color}`}>{trend.label}</span>
                  {entry.previousScore !== null && (
                    <span className="text-xs text-text-muted">
                      (was {entry.previousScore})
                    </span>
                  )}
                </div>

                {/* Meta */}
                <div className="flex items-center gap-2 text-xs text-text-muted mb-4">
                  <span className="capitalize">{entry.platform}</span>
                  <span>|</span>
                  <span>
                    Last scanned {new Date(entry.lastScannedAt).toLocaleTimeString()}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/scan/${entry.tokenMint}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-accent/15 hover:bg-accent/25 text-accent font-semibold text-sm rounded-lg transition-colors cursor-pointer"
                  >
                    View <ArrowRight size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeMutation.mutate(entry.tokenMint);
                    }}
                    className="p-2 bg-critical/10 hover:bg-critical/20 text-critical rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

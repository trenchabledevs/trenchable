import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getScanHistory, clearHistory } from '../lib/api';
import { shortenAddress, getRiskColor, getRiskLabel } from '../lib/format';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { History, Trash2, ExternalLink, Search } from 'lucide-react';

export function HistoryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: history, isLoading } = useQuery({
    queryKey: ['history'],
    queryFn: () => getScanHistory(100),
  });

  const clearMutation = useMutation({
    mutationFn: clearHistory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history'] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <History size={24} className="text-accent" />
            <h1 className="text-2xl font-bold">Scan History</h1>
          </div>
          <p className="text-text-dim text-sm">All previous token scans stored locally</p>
        </div>

        {history && history.length > 0 && (
          <button
            onClick={() => clearMutation.mutate()}
            className="flex items-center gap-2 px-3 py-1.5 bg-critical/10 border border-critical/30 rounded-lg text-xs font-medium text-critical hover:bg-critical/20 transition-colors cursor-pointer"
          >
            <Trash2 size={12} />
            Clear All
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <LoadingSpinner size={32} />
        </div>
      )}

      {!isLoading && (!history || history.length === 0) && (
        <div className="text-center py-16">
          <History size={48} className="mx-auto text-text-muted mb-4" />
          <h3 className="text-lg font-semibold text-text mb-2">No scans yet</h3>
          <p className="text-text-dim text-sm">Scan a token to see it appear here</p>
        </div>
      )}

      {history && history.length > 0 && (
        <div className="space-y-2">
          {history.map((entry) => {
            const color = getRiskColor(entry.overallScore);
            return (
              <div
                key={entry.id}
                className="bg-bg-card border border-border rounded-xl p-4 hover:border-border-hover transition-colors cursor-pointer flex items-center gap-4"
                onClick={() => navigate(`/scan/${entry.tokenMint}`)}
              >
                {/* Score circle */}
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 border-2"
                  style={{ color, borderColor: `${color}40`, backgroundColor: `${color}10` }}
                >
                  {entry.overallScore}
                </div>

                {/* Token info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text truncate">
                      {entry.tokenName || 'Unknown'}
                    </span>
                    {entry.tokenSymbol && (
                      <span className="text-text-dim text-sm">${entry.tokenSymbol}</span>
                    )}
                  </div>
                  <code className="text-xs font-mono text-text-muted">
                    {shortenAddress(entry.tokenMint, 6)}
                  </code>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span
                    className="px-2.5 py-0.5 rounded-full text-xs font-semibold border"
                    style={{ color, backgroundColor: `${color}15`, borderColor: `${color}30` }}
                  >
                    {getRiskLabel(entry.riskLevel)}
                  </span>
                  <span className="text-xs text-text-muted capitalize">{entry.platform}</span>
                  <span className="text-xs text-text-muted">
                    {new Date(entry.scanTimestamp).toLocaleString()}
                  </span>
                  <ExternalLink size={14} className="text-text-muted" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

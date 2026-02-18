import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getRpcSettings, updateRpc, getHealth } from '../lib/api';
import { useSettings } from '../stores/settings.store';
import { Settings, Server, Zap, CheckCircle, XCircle } from 'lucide-react';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

export function SettingsPage() {
  const { rpcUrl, setRpcUrl } = useSettings();
  const [inputUrl, setInputUrl] = useState(rpcUrl);

  const health = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 30_000,
  });

  const rpcSettings = useQuery({
    queryKey: ['rpc-settings'],
    queryFn: getRpcSettings,
  });

  const updateMutation = useMutation({
    mutationFn: updateRpc,
    onSuccess: (data) => {
      setRpcUrl(inputUrl);
      health.refetch();
    },
  });

  const handleSave = () => {
    if (inputUrl.trim()) {
      updateMutation.mutate(inputUrl.trim());
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Settings size={24} className="text-accent" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {/* RPC Connection Status */}
      <div className="bg-bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
          Connection Status
        </h2>

        <div className="flex items-center gap-4">
          {health.isLoading ? (
            <LoadingSpinner size={20} />
          ) : health.data?.rpcConnected ? (
            <div className="flex items-center gap-2 text-safe">
              <CheckCircle size={20} />
              <span className="font-semibold">Connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-critical">
              <XCircle size={20} />
              <span className="font-semibold">Disconnected</span>
            </div>
          )}

          {health.data && (
            <div className="flex items-center gap-1.5 text-text-dim text-sm">
              <Zap size={14} />
              <span>{health.data.rpcLatencyMs}ms latency</span>
            </div>
          )}
        </div>
      </div>

      {/* RPC Configuration */}
      <div className="bg-bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
          RPC Endpoint
        </h2>

        <p className="text-text-dim text-sm mb-4">
          Configure a custom Solana RPC endpoint for faster scans. Supports Helius, QuickNode, Alchemy, and others.
          Leave empty to use the public Solana RPC (rate-limited).
        </p>

        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1 flex items-center gap-2 bg-bg border border-border rounded-xl px-4 py-3 focus-within:border-accent/50">
              <Server size={16} className="text-text-muted flex-shrink-0" />
              <input
                type="url"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
                className="flex-1 bg-transparent outline-none text-text text-sm font-mono placeholder:text-text-muted"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending || !inputUrl.trim()}
              className="px-5 py-3 bg-accent hover:bg-accent-dim disabled:opacity-40 text-white font-semibold rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed text-sm"
            >
              {updateMutation.isPending ? <LoadingSpinner size={16} /> : 'Save'}
            </button>
          </div>

          {updateMutation.isSuccess && (
            <div className="flex items-center gap-2 text-safe text-sm">
              <CheckCircle size={14} />
              RPC updated successfully ({updateMutation.data?.latencyMs}ms latency)
            </div>
          )}

          {updateMutation.isError && (
            <div className="flex items-center gap-2 text-critical text-sm">
              <XCircle size={14} />
              {(updateMutation.error as Error).message}
            </div>
          )}
        </div>
      </div>

      {/* Info card */}
      <div className="bg-accent/5 border border-accent/20 rounded-xl p-5">
        <h3 className="font-semibold text-accent text-sm mb-2">Recommended RPC Providers</h3>
        <ul className="text-text-dim text-sm space-y-1.5">
          <li><strong className="text-text">Helius</strong> — Best for Solana, has enhanced token APIs</li>
          <li><strong className="text-text">QuickNode</strong> — Reliable with good rate limits</li>
          <li><strong className="text-text">Alchemy</strong> — Well-known infrastructure provider</li>
          <li><strong className="text-text">Triton (RPC Pool)</strong> — Low latency, good for WebSocket</li>
        </ul>
      </div>
    </div>
  );
}

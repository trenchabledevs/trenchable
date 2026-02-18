import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getInstantScan, getDeepScan } from '../lib/api';
import { AddressInput } from '../components/scan/AddressInput';
import { RiskGauge } from '../components/scan/RiskGauge';
import { RiskCard } from '../components/scan/RiskCard';
import { ScanSummary } from '../components/scan/ScanSummary';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { AlertTriangle, TrendingUp, TrendingDown, Minus, Zap, ChevronRight } from 'lucide-react';
import type { ExtendedScanResponse } from '@trenchable/shared';

function formatUsd(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function MCPredictionPanel({ scan }: { scan: ExtendedScanResponse }) {
  const mc = scan.mcPrediction;
  if (!mc) return null;

  const trendIcon = {
    accumulating: <TrendingUp size={13} className="text-safe" />,
    trending: <TrendingUp size={13} className="text-warning" />,
    consolidating: <Minus size={13} className="text-text-muted" />,
    mature: <Minus size={13} className="text-text-muted" />,
    dying: <TrendingDown size={13} className="text-critical" />,
  }[mc.fairValue.trend] ?? <ChevronRight size={13} className="text-text-muted" />;

  const confidenceColor = { low: 'text-critical', medium: 'text-warning', high: 'text-safe' }[mc.confidence] ?? 'text-text-muted';

  return (
    <div className="bg-accent/5 border border-accent/15 rounded-xl p-4 mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-accent uppercase tracking-wider">MC Prediction</h3>
        <span className={`text-xs font-semibold ${confidenceColor}`}>
          {mc.confidence} confidence
        </span>
      </div>

      {/* Bonding curve */}
      {mc.bondingCurve && (
        <div className="mb-3">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-text-muted font-medium">Bonding Curve</span>
            <span className="text-xs font-bold text-accent">
              {mc.bondingCurve.progressPct.toFixed(0)}%
              {mc.bondingCurve.remainingToGraduateSol > 0 && (
                <span className="text-text-muted font-normal ml-1">
                  ({mc.bondingCurve.remainingToGraduateSol.toFixed(1)} SOL to grad)
                </span>
              )}
            </span>
          </div>
          <div className="w-full h-2 bg-border rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(mc.bondingCurve.progressPct, 100)}%`,
                background: 'linear-gradient(90deg, #8b5cf6, #c084fc)',
              }}
            />
          </div>
        </div>
      )}

      {/* Fair value range */}
      {mc.fairValue.high > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-bg rounded-lg px-3 py-2 text-center">
            <div className="text-xs text-text-muted mb-0.5">Low</div>
            <div className="text-sm font-bold text-text">{formatUsd(mc.fairValue.low)}</div>
          </div>
          <div className="bg-accent/10 border border-accent/20 rounded-lg px-3 py-2 text-center">
            <div className="text-xs text-accent mb-0.5">Mid</div>
            <div className="text-sm font-bold text-accent">{formatUsd(mc.fairValue.mid)}</div>
          </div>
          <div className="bg-bg rounded-lg px-3 py-2 text-center">
            <div className="text-xs text-text-muted mb-0.5">High</div>
            <div className="text-sm font-bold text-text">{formatUsd(mc.fairValue.high)}</div>
          </div>
        </div>
      )}

      {/* Trend + summary */}
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex-shrink-0">{trendIcon}</div>
        <p className="text-xs text-text-dim leading-relaxed">{mc.summary}</p>
      </div>
    </div>
  );
}

export function ResultPage() {
  const { address } = useParams<{ address: string }>();
  const navigate = useNavigate();
  const [deepRequested, setDeepRequested] = useState(false);

  const {
    data: scan,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['instant-scan', address],
    queryFn: () => getInstantScan(address!),
    enabled: !!address,
    retry: 1,
    staleTime: 30_000,
  });

  const {
    data: deepScan,
    isLoading: deepLoading,
    refetch: runDeepScan,
  } = useQuery({
    queryKey: ['deep-scan', address],
    queryFn: () => getDeepScan(address!),
    enabled: false,
    retry: 0,
    staleTime: 120_000,
  });

  const activeScan = deepScan || scan;
  const isDeepMode = activeScan?.scanMode === 'deep';

  const handleNewScan = (newAddress: string) => {
    navigate(`/scan/${newAddress}`);
  };

  const handleDeepScan = () => {
    setDeepRequested(true);
    runDeepScan();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <LoadingSpinner size={48} />
        <p className="mt-6 text-text-dim text-lg">Scanning token...</p>
        <p className="mt-2 text-text-muted text-sm">
          Running 9 instant checks across 4 external APIs
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {['Mint Auth', 'Freeze Auth', 'LP Status', 'Holders', 'Honeypot', 'Dev Wallet', 'GoPlus', 'DexScreener', 'Rugcheck'].map(
            (check) => (
              <span key={check} className="px-3 py-1 bg-bg-card border border-border rounded-full text-xs text-text-muted animate-pulse">
                {check}
              </span>
            )
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <AddressInput onScan={handleNewScan} />
        </div>
        <div className="bg-critical/10 border border-critical/30 rounded-xl p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 text-critical" size={32} />
          <h2 className="text-lg font-bold text-critical mb-2">Scan Failed</h2>
          <p className="text-text-dim text-sm">
            {(error as Error).message || 'Could not scan this token. Please check the address and try again.'}
          </p>
        </div>
      </div>
    );
  }

  if (!activeScan) return null;

  // Sort: danger first, then warning, then unknown, then safe; within each group by score desc
  const sortedChecks = [...activeScan.checks].sort((a, b) => {
    const order = { danger: 0, warning: 1, unknown: 2, safe: 3 } as const;
    const statusDiff = (order[a.status] ?? 2) - (order[b.status] ?? 2);
    return statusDiff !== 0 ? statusDiff : b.score - a.score;
  });

  return (
    <div>
      {/* Top search bar */}
      <div className="mb-8 max-w-2xl mx-auto">
        <AddressInput onScan={handleNewScan} />
      </div>

      {/* Summary */}
      <ScanSummary scan={activeScan} />

      {/* Deep scan banner */}
      {!isDeepMode && !deepRequested && (
        <div className="mt-4 flex items-center justify-between bg-accent/5 border border-accent/20 rounded-xl px-5 py-3">
          <div className="flex items-center gap-2.5">
            <Zap size={16} className="text-accent flex-shrink-0" />
            <div>
              <span className="text-sm font-semibold text-text">Instant scan complete</span>
              <span className="text-text-muted text-sm"> · Run deep scan for 12 on-chain checks</span>
            </div>
          </div>
          <button
            onClick={handleDeepScan}
            className="text-sm font-bold text-accent hover:text-white bg-accent/10 hover:bg-accent transition-colors px-4 py-1.5 rounded-lg flex-shrink-0 ml-4"
          >
            Deep Scan
          </button>
        </div>
      )}

      {deepLoading && (
        <div className="mt-4 flex items-center gap-3 bg-accent/5 border border-accent/20 rounded-xl px-5 py-3">
          <LoadingSpinner size={18} />
          <span className="text-sm text-text-dim">Running 12 on-chain checks...</span>
        </div>
      )}

      {/* MC Prediction */}
      {activeScan.mcPrediction && <MCPredictionPanel scan={activeScan} />}

      {/* Main: gauge + checks */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 flex flex-col items-center">
          <div className="sticky top-24 bg-bg-card border border-border rounded-xl p-8 w-full flex flex-col items-center">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-6">
              Overall Risk Score
            </h3>
            <RiskGauge score={activeScan.overallScore} level={activeScan.riskLevel} />

            <div className="mt-6 w-full space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Checks passed</span>
                <span className="text-safe font-semibold">
                  {activeScan.checks.filter(c => c.status === 'safe').length}/{activeScan.checks.length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Warnings</span>
                <span className="text-warning font-semibold">
                  {activeScan.checks.filter(c => c.status === 'warning').length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Dangers</span>
                <span className="text-critical font-semibold">
                  {activeScan.checks.filter(c => c.status === 'danger').length}
                </span>
              </div>
            </div>

            <div className="mt-4 w-full pt-4 border-t border-border">
              <div className="flex justify-between text-xs text-text-muted">
                <span>Scan type</span>
                <span className={`font-bold uppercase ${isDeepMode ? 'text-safe' : 'text-accent'}`}>
                  {activeScan.scanMode ?? 'instant'}
                </span>
              </div>
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>Duration</span>
                <span>{activeScan.scanDurationMs}ms</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
            Detailed Checks
            <span className="ml-2 text-xs text-text-dim font-normal normal-case">
              ({activeScan.checks.length} {isDeepMode ? 'deep' : 'instant'} checks)
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sortedChecks.map((check) => (
              <RiskCard key={check.check} result={check} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

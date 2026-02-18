import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { compareTokens } from '../lib/api';
import type { ScanResponse } from '@trenchable/shared';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { RiskGauge } from '../components/scan/RiskGauge';
import { StatusBadge } from '../components/common/StatusBadge';
import { shortenAddress, getRiskColor } from '../lib/format';
import { CopyButton } from '../components/common/CopyButton';
import { GitCompareArrows, Plus, X, Search } from 'lucide-react';

export function ComparePage() {
  const [addresses, setAddresses] = useState<string[]>(['', '']);
  const [results, setResults] = useState<ScanResponse[] | null>(null);

  const compareMutation = useMutation({
    mutationFn: compareTokens,
    onSuccess: (data) => setResults(data.scans),
  });

  const addAddress = () => {
    if (addresses.length < 5) {
      setAddresses([...addresses, '']);
    }
  };

  const removeAddress = (index: number) => {
    if (addresses.length > 2) {
      setAddresses(addresses.filter((_, i) => i !== index));
    }
  };

  const updateAddress = (index: number, value: string) => {
    const updated = [...addresses];
    updated[index] = value;
    setAddresses(updated);
  };

  const handleCompare = () => {
    const valid = addresses.filter(a => a.trim().length >= 32);
    if (valid.length >= 2) {
      compareMutation.mutate(valid);
    }
  };

  const validCount = addresses.filter(a => a.trim().length >= 32).length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <GitCompareArrows size={24} className="text-accent" />
        <div>
          <h1 className="text-2xl font-bold">Compare Tokens</h1>
          <p className="text-text-dim text-sm">Side-by-side safety comparison of up to 5 tokens</p>
        </div>
      </div>

      {/* Input area */}
      <div className="bg-bg-card border border-border rounded-xl p-6 mb-8">
        <div className="space-y-3">
          {addresses.map((addr, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-text-muted text-sm w-6 text-right">{i + 1}.</span>
              <div className="flex-1 flex items-center gap-2 bg-bg border border-border rounded-xl px-4 py-2.5 focus-within:border-accent/50">
                <Search size={14} className="text-text-muted" />
                <input
                  type="text"
                  value={addr}
                  onChange={(e) => updateAddress(i, e.target.value)}
                  placeholder="Paste token address..."
                  className="flex-1 bg-transparent outline-none text-text text-sm font-mono placeholder:text-text-muted"
                />
              </div>
              {addresses.length > 2 && (
                <button
                  onClick={() => removeAddress(i)}
                  className="p-2 text-text-muted hover:text-critical transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-4">
          {addresses.length < 5 && (
            <button
              onClick={addAddress}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-text-dim hover:text-text hover:border-border-hover transition-colors cursor-pointer"
            >
              <Plus size={14} /> Add Token
            </button>
          )}
          <button
            onClick={handleCompare}
            disabled={validCount < 2 || compareMutation.isPending}
            className="flex items-center gap-2 px-5 py-2 bg-accent hover:bg-accent-dim disabled:opacity-40 text-white font-semibold rounded-xl transition-colors cursor-pointer text-sm ml-auto"
          >
            {compareMutation.isPending ? <LoadingSpinner size={16} /> : <GitCompareArrows size={16} />}
            Compare ({validCount})
          </button>
        </div>
      </div>

      {/* Results */}
      {compareMutation.isPending && (
        <div className="text-center py-12">
          <LoadingSpinner size={32} />
          <p className="mt-4 text-text-dim">Scanning tokens...</p>
        </div>
      )}

      {results && results.length > 0 && (
        <div>
          {/* Overview comparison cards */}
          <div className={`grid gap-4 ${results.length === 2 ? 'grid-cols-2' : results.length === 3 ? 'grid-cols-3' : 'grid-cols-2 lg:grid-cols-4'}`}>
            {results.map((scan) => (
              <div key={scan.tokenMint} className="bg-bg-card border border-border rounded-xl p-5 flex flex-col items-center">
                <h3 className="font-semibold text-text mb-1 text-center truncate w-full">
                  {scan.tokenName || 'Unknown'}
                </h3>
                <div className="flex items-center gap-1.5 mb-4">
                  <code className="text-xs font-mono text-text-muted">
                    {shortenAddress(scan.tokenMint, 4)}
                  </code>
                  <CopyButton text={scan.tokenMint} />
                </div>
                <RiskGauge score={scan.overallScore} level={scan.riskLevel} size={140} />
                <span className="text-xs text-text-muted capitalize mt-3">{scan.platform}</span>
              </div>
            ))}
          </div>

          {/* Detailed check comparison table */}
          <div className="mt-8 bg-bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-text-muted font-medium">Check</th>
                    {results.map((scan) => (
                      <th key={scan.tokenMint} className="text-center py-3 px-4 text-text-muted font-medium">
                        {scan.tokenSymbol ? `$${scan.tokenSymbol}` : shortenAddress(scan.tokenMint, 3)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(results[0]?.checks || []).map((_, checkIdx) => {
                    const checkName = results[0].checks[checkIdx]?.check;
                    return (
                      <tr key={checkName} className="border-b border-border/50 hover:bg-bg-card-hover/50">
                        <td className="py-2.5 px-4 text-text-dim font-medium">
                          {checkName?.replace(/_/g, ' ')}
                        </td>
                        {results.map((scan) => {
                          const check = scan.checks.find(c => c.check === checkName);
                          if (!check) return <td key={scan.tokenMint} className="text-center py-2.5 px-4">-</td>;
                          const color = getRiskColor(check.score);
                          return (
                            <td key={scan.tokenMint} className="text-center py-2.5 px-4">
                              <div className="flex items-center justify-center gap-2">
                                <span className="font-mono font-semibold" style={{ color }}>
                                  {check.score}
                                </span>
                                <StatusBadge status={check.status} />
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

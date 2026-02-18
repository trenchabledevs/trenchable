import { useNavigate } from 'react-router-dom';
import { AddressInput } from '../components/scan/AddressInput';
import { useScan } from '../hooks/useScan';
import { Shield, Zap, Eye, Package, Droplets, Bug, Users } from 'lucide-react';

const features = [
  { icon: Package, label: 'Bundle Detection', desc: 'Detect bundled launches and snipers' },
  { icon: Users, label: 'Holder Analysis', desc: 'Top holder concentration risk' },
  { icon: Droplets, label: 'LP Status', desc: 'Burned, locked, or unlocked liquidity' },
  { icon: Shield, label: 'Mint Authority', desc: 'Can more tokens be minted?' },
  { icon: Eye, label: 'Dev Wallet', desc: 'Track deployer holdings & sells' },
  { icon: Bug, label: 'Honeypot Check', desc: 'Verify the token can be sold' },
];

export function ScanPage() {
  const navigate = useNavigate();
  const scan = useScan();

  const handleScan = (address: string) => {
    navigate(`/scan/${address}`);
  };

  return (
    <div className="flex flex-col items-center">
      {/* Hero */}
      <div className="text-center mt-12 mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent/10 border border-accent/20 rounded-full text-accent text-xs font-semibold mb-6">
          <Zap size={12} />
          Solana Memecoin Safety Scanner
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
          Strike gold in the{' '}
          <span className="text-accent">trenches</span>
        </h1>
        <p className="text-text-dim text-lg max-w-xl mx-auto">
          Scan any Solana memecoin for rugs, honeypots, bundled launches, and sniper bots
          before you ape in. Instant results, zero fluff.
        </p>
      </div>

      {/* Search */}
      <div className="w-full max-w-2xl mb-16">
        <AddressInput onScan={handleScan} isLoading={scan.isPending} large />
      </div>

      {/* Features grid */}
      <div className="w-full max-w-4xl">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4 text-center">
          What we check
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="bg-bg-card border border-border rounded-xl p-4 hover:border-border-hover transition-colors"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Icon size={16} className="text-accent" />
                </div>
                <h3 className="font-semibold text-sm text-text">{label}</h3>
              </div>
              <p className="text-text-dim text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

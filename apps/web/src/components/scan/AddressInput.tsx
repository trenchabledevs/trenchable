import { useState } from 'react';
import { Search } from 'lucide-react';
import { LoadingSpinner } from '../common/LoadingSpinner';

interface AddressInputProps {
  onScan: (address: string) => void;
  isLoading?: boolean;
  large?: boolean;
}

export function AddressInput({ onScan, isLoading, large }: AddressInputProps) {
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');

  const validate = (addr: string) => {
    if (!addr.trim()) return 'Enter a token address';
    if (addr.length < 32 || addr.length > 44) return 'Invalid Solana address length';
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(addr)) return 'Invalid base58 characters';
    return '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate(address);
    if (err) {
      setError(err);
      return;
    }
    setError('');
    onScan(address.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div
        className={`flex items-center gap-3 bg-bg-card border border-border rounded-2xl transition-all focus-within:border-accent/50 focus-within:shadow-[0_0_20px_rgba(139,92,246,0.1)] ${
          large ? 'px-5 py-4' : 'px-4 py-3'
        }`}
      >
        <Search size={large ? 22 : 18} className="text-text-muted flex-shrink-0" />
        <input
          type="text"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            if (error) setError('');
          }}
          placeholder="Paste Solana token address..."
          className={`flex-1 bg-transparent outline-none text-text placeholder:text-text-muted font-mono ${
            large ? 'text-lg' : 'text-sm'
          }`}
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !address.trim()}
          className={`flex items-center gap-2 bg-accent hover:bg-accent-dim disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all cursor-pointer ${
            large ? 'px-6 py-2.5 text-base' : 'px-4 py-2 text-sm'
          }`}
        >
          {isLoading ? (
            <>
              <LoadingSpinner size={16} />
              Scanning...
            </>
          ) : (
            'Scan'
          )}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-critical pl-2">{error}</p>
      )}
    </form>
  );
}

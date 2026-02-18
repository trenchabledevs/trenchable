import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-text-dim hover:text-text transition-colors cursor-pointer"
      title="Copy to clipboard"
    >
      {copied ? <Check size={14} className="text-safe" /> : <Copy size={14} />}
    </button>
  );
}

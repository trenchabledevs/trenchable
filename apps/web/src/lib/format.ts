export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function getRiskColor(score: number): string {
  if (score <= 25) return '#22c55e';
  if (score <= 50) return '#eab308';
  if (score <= 75) return '#f97316';
  return '#ef4444';
}

export function getRiskLabel(level: string): string {
  switch (level) {
    case 'low': return 'Low Risk';
    case 'moderate': return 'Moderate Risk';
    case 'high': return 'High Risk';
    case 'critical': return 'Critical Risk';
    default: return 'Unknown';
  }
}

export function getRiskBg(score: number): string {
  if (score <= 25) return 'bg-safe/10 border-safe/30';
  if (score <= 50) return 'bg-warning/10 border-warning/30';
  if (score <= 75) return 'bg-danger/10 border-danger/30';
  return 'bg-critical/10 border-critical/30';
}

export function getStatusIcon(status: string): string {
  switch (status) {
    case 'safe': return '\u2705';
    case 'warning': return '\u26A0\uFE0F';
    case 'danger': return '\uD83D\uDED1';
    case 'unknown': return '\u2753';
    default: return '\u2753';
  }
}

export function formatTimestamp(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

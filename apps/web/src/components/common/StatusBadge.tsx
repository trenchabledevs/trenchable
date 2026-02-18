import type { RiskStatus } from '@trenchable/shared';

const badgeStyles: Record<RiskStatus, string> = {
  safe: 'bg-safe/15 text-safe border-safe/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  danger: 'bg-critical/15 text-critical border-critical/30',
  unknown: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

const labels: Record<RiskStatus, string> = {
  safe: 'Safe',
  warning: 'Warning',
  danger: 'Danger',
  unknown: 'Unknown',
};

export function StatusBadge({ status }: { status: RiskStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeStyles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

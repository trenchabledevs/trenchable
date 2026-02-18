import { getRiskColor, getRiskLabel } from '../../lib/format';
import type { RiskLevel } from '@trenchable/shared';

interface RiskGaugeProps {
  score: number;
  level: RiskLevel;
  size?: number;
}

export function RiskGauge({ score, level, size = 200 }: RiskGaugeProps) {
  const color = getRiskColor(score);
  const label = getRiskLabel(level);

  // SVG arc calculations
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const offset = circumference - progress;
  const center = size / 2;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-border"
          />
          {/* Progress arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
            style={{
              filter: `drop-shadow(0 0 8px ${color}40)`,
            }}
          />
        </svg>
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-5xl font-extrabold tabular-nums"
            style={{ color }}
          >
            {score}
          </span>
          <span className="text-text-muted text-sm font-medium mt-1">/ 100</span>
        </div>
      </div>
      <div
        className="px-4 py-1.5 rounded-full text-sm font-bold border"
        style={{
          color,
          backgroundColor: `${color}15`,
          borderColor: `${color}30`,
        }}
      >
        {label}
      </div>
    </div>
  );
}

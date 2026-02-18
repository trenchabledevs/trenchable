import type { RiskCheckResult, RiskLevel } from '@trenchable/shared';

export function calculateOverallScore(results: RiskCheckResult[]): number {
  let totalScore = 0;
  let totalWeight = 0;

  for (const result of results) {
    if (result.status !== 'unknown') {
      totalScore += result.score * result.weight;
      totalWeight += result.weight;
    }
  }

  // Normalize to 0-100 based on checks that actually completed
  let normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 50;

  // Critical overrides: certain checks force a minimum score
  const honeypot = results.find(r => r.check === 'HONEYPOT');
  if (honeypot && honeypot.score >= 90) {
    normalizedScore = Math.max(normalizedScore, 90);
  }

  const mintAuth = results.find(r => r.check === 'MINT_AUTHORITY');
  if (mintAuth && mintAuth.score >= 90) {
    normalizedScore = Math.max(normalizedScore, 75);
  }

  return Math.round(normalizedScore);
}

export function getRiskLevel(score: number): RiskLevel {
  if (score <= 25) return 'low';
  if (score <= 50) return 'moderate';
  if (score <= 75) return 'high';
  return 'critical';
}

export function getRiskColor(score: number): string {
  if (score <= 25) return '#22c55e';
  if (score <= 50) return '#eab308';
  if (score <= 75) return '#f97316';
  return '#ef4444';
}

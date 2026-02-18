export interface RugcheckReport {
  mint: string;
  score: number;
  score_normalised: number;
  risks: { name: string; value: string; description: string; score: number; level: string }[] | null;
  tokenProgram: string;
  token: {
    mintAuthority: string | null;
    freezeAuthority: string | null;
    supply: number;
    decimals: number;
  } | null;
  topHolders: {
    address: string;
    amount: number;
    decimals: number;
    pct: number;
    uiAmount: number;
    uiAmountString: string;
    owner: string;
    insider: boolean;
  }[] | null;
  markets: {
    marketType: string;
    mintA: string;
    mintB: string;
    mintLP: string;
    liquidityA: string;
    liquidityB: string;
    liquidityAAccount: string;
    liquidityBAccount: string;
    lp: {
      lpLockedPct: number;
      lpBurnedPct: number;
      lpTotalSupply: string;
      lpCurrentSupply: string;
    };
  }[] | null;
  totalMarketLiquidity: number;
  rugged: boolean;
  creator: string | null;
  creatorBalance: number;
  tokenType: string;
  transferFee: { pct: number; maxAmount: number; authority: string };
  knownAccounts: Record<string, { name: string; type: string }> | null;
  verification: { verified: boolean; jup_verified: boolean; mint: string } | null;
  graphInsidersDetected: number;
}

export async function getRugcheckReport(mint: string): Promise<RugcheckReport | null> {
  try {
    const url = `https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;

    const data = await res.json() as RugcheckReport;
    // Rugcheck returns score=0 for tokens it can't analyze
    if (!data.mint) return null;
    return data;
  } catch {
    return null;
  }
}

export function extractRugcheckRisks(report: RugcheckReport): string[] {
  const flags: string[] = [];
  if (report.rugged) flags.push('Rugcheck: Token has been RUGGED');
  if (report.risks) {
    for (const risk of report.risks) {
      if (risk.level === 'danger' || risk.level === 'error' || risk.score >= 5000) {
        flags.push(`Rugcheck: ${risk.name} — ${risk.description}`);
      }
    }
  }
  if (report.graphInsidersDetected > 0) {
    flags.push(`Rugcheck: ${report.graphInsidersDetected} insider wallets detected`);
  }
  return flags;
}

export function extractLpLockData(report: RugcheckReport): {
  lpLockedPct: number;
  lpBurnedPct: number;
  totalLiquidity: number;
} | null {
  if (!report.markets || report.markets.length === 0) return null;

  // Use the market with highest liquidity
  let bestLpLocked = 0;
  let bestLpBurned = 0;

  for (const market of report.markets) {
    if (market.lp) {
      bestLpLocked = Math.max(bestLpLocked, market.lp.lpLockedPct || 0);
      bestLpBurned = Math.max(bestLpBurned, market.lp.lpBurnedPct || 0);
    }
  }

  return {
    lpLockedPct: bestLpLocked,
    lpBurnedPct: bestLpBurned,
    totalLiquidity: report.totalMarketLiquidity,
  };
}

import { PublicKey } from '@solana/web3.js';
import { RISK_WEIGHTS, PROGRAM_IDS, type RiskCheckResult, type HolderInfo } from '@trenchable/shared';
import type { ScanContext } from '../types/risk.types.js';

// Known addresses to exclude from concentration analysis
const EXCLUDED_ADDRESSES = new Set([
  '1nc1nerator11111111111111111111111111111111',  // Burn address
  '1111111111111111111111111111111111',             // System null
]);

function isLPOrBurnAddress(address: string): boolean {
  return EXCLUDED_ADDRESSES.has(address) ||
    address.startsWith('1111') ||
    address === PROGRAM_IDS.RAYDIUM_V4_AMM ||
    address === PROGRAM_IDS.PUMP_FUN;
}

export async function checkHolderConcentration(ctx: ScanContext): Promise<RiskCheckResult> {
  try {
    // Get the 20 largest token accounts for this mint
    const largestAccounts = await ctx.connection.getTokenLargestAccounts(ctx.tokenMint);

    if (largestAccounts.value.length === 0) {
      return {
        check: 'TOP_HOLDERS',
        status: 'unknown',
        score: 50,
        weight: RISK_WEIGHTS.TOP_HOLDERS,
        details: {},
        message: 'No token holders found',
      };
    }

    // Get total supply
    const supply = ctx.mintInfo?.supply
      ? Number(ctx.mintInfo.supply)
      : largestAccounts.value.reduce((sum, a) => sum + Number(a.amount), 0);

    // Build holder info
    const holders: HolderInfo[] = [];
    let excludedSupply = 0;

    for (const account of largestAccounts.value) {
      const amount = Number(account.amount);
      const address = account.address.toBase58();
      const isLP = isLPOrBurnAddress(address);

      if (isLP) {
        excludedSupply += amount;
      }

      holders.push({
        address,
        amount,
        percentage: supply > 0 ? (amount / supply) * 100 : 0,
        isLP,
        isBurn: address.startsWith('1111'),
      });
    }

    // Filter to only real holders (exclude LP/burn addresses)
    const realHolders = holders.filter(h => !h.isLP && !h.isBurn);
    const adjustedSupply = supply - excludedSupply;

    // Recalculate percentages against adjusted supply
    for (const holder of realHolders) {
      holder.percentage = adjustedSupply > 0 ? (holder.amount / adjustedSupply) * 100 : 0;
    }

    // Sort by amount descending
    realHolders.sort((a, b) => b.amount - a.amount);

    const top1Pct = realHolders[0]?.percentage ?? 0;
    const top5Pct = realHolders.slice(0, 5).reduce((s, h) => s + h.percentage, 0);
    const top10Pct = realHolders.slice(0, 10).reduce((s, h) => s + h.percentage, 0);

    // Scoring
    let score: number;
    let status: 'safe' | 'warning' | 'danger';
    let message: string;

    if (top1Pct > 15) {
      score = 95;
      status = 'danger';
      message = `Top holder owns ${top1Pct.toFixed(1)}% of supply — extreme concentration risk`;
    } else if (top10Pct > 75) {
      score = 90;
      status = 'danger';
      message = `Top 10 holders own ${top10Pct.toFixed(1)}% of supply — very high concentration`;
    } else if (top10Pct > 50) {
      score = 50;
      status = 'warning';
      message = `Top 10 holders own ${top10Pct.toFixed(1)}% of supply — moderate concentration`;
    } else if (top10Pct > 30) {
      score = 25;
      status = 'warning';
      message = `Top 10 holders own ${top10Pct.toFixed(1)}% of supply — slight concentration`;
    } else {
      score = 0;
      status = 'safe';
      message = `Top 10 holders own ${top10Pct.toFixed(1)}% of supply — well distributed`;
    }

    return {
      check: 'TOP_HOLDERS',
      status,
      score,
      weight: RISK_WEIGHTS.TOP_HOLDERS,
      details: {
        top1Pct: Math.round(top1Pct * 10) / 10,
        top5Pct: Math.round(top5Pct * 10) / 10,
        top10Pct: Math.round(top10Pct * 10) / 10,
        totalHolders: largestAccounts.value.length,
        holders: realHolders.slice(0, 10).map(h => ({
          address: h.address,
          percentage: Math.round(h.percentage * 10) / 10,
        })),
      },
      message,
    };
  } catch (error) {
    return {
      check: 'TOP_HOLDERS',
      status: 'unknown',
      score: 50,
      weight: RISK_WEIGHTS.TOP_HOLDERS,
      details: { error: String(error) },
      message: 'Could not analyze holder concentration',
    };
  }
}

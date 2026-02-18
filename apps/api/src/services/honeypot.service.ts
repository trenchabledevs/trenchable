import { RISK_WEIGHTS, SOL_MINT, type RiskCheckResult } from '@trenchable/shared';
import { config } from '../config/env.js';
import type { ScanContext } from '../types/risk.types.js';

export async function checkHoneypot(ctx: ScanContext): Promise<RiskCheckResult> {
  try {
    // Use Jupiter Quote API to simulate selling a small amount of the token for SOL
    const testAmount = 1_000_000; // 1 token (assuming 6 decimals — will work for rough check)
    const url = `${config.jupiter.apiUrl}/quote?inputMint=${ctx.tokenMint.toBase58()}&outputMint=${SOL_MINT}&amount=${testAmount}&slippageBps=5000`;

    const response = await fetch(url);

    if (!response.ok) {
      // Jupiter returned an error — likely cannot route this token
      const errorText = await response.text();

      // If it's specifically a "no route" error, this is a strong honeypot signal
      if (response.status === 400 || errorText.includes('NO_ROUTE') || errorText.includes('ROUTE_NOT_FOUND')) {
        return {
          check: 'HONEYPOT',
          status: 'danger',
          score: 100,
          weight: RISK_WEIGHTS.HONEYPOT,
          details: {
            canSell: false,
            jupiterError: errorText.substring(0, 200),
          },
          message: 'Token CANNOT be sold — no swap routes found (honeypot)',
        };
      }

      return {
        check: 'HONEYPOT',
        status: 'unknown',
        score: 50,
        weight: RISK_WEIGHTS.HONEYPOT,
        details: { error: errorText.substring(0, 200) },
        message: 'Could not verify if token is sellable',
      };
    }

    const quote = await response.json();

    // Check price impact
    const priceImpact = Math.abs(parseFloat(quote.priceImpactPct || '0')) * 100;

    if (priceImpact > 50) {
      return {
        check: 'HONEYPOT',
        status: 'danger',
        score: 80,
        weight: RISK_WEIGHTS.HONEYPOT,
        details: {
          canSell: true,
          priceImpactPct: priceImpact,
          outputAmount: quote.outAmount,
        },
        message: `Token can be sold but has extreme price impact (${priceImpact.toFixed(1)}%) — very thin liquidity`,
      };
    }

    if (priceImpact > 20) {
      return {
        check: 'HONEYPOT',
        status: 'warning',
        score: 60,
        weight: RISK_WEIGHTS.HONEYPOT,
        details: {
          canSell: true,
          priceImpactPct: priceImpact,
          outputAmount: quote.outAmount,
        },
        message: `Token can be sold but has high price impact (${priceImpact.toFixed(1)}%) — low liquidity`,
      };
    }

    return {
      check: 'HONEYPOT',
      status: 'safe',
      score: 0,
      weight: RISK_WEIGHTS.HONEYPOT,
      details: {
        canSell: true,
        priceImpactPct: priceImpact,
        outputAmount: quote.outAmount,
        routePlan: quote.routePlan?.length ?? 0,
      },
      message: `Token is sellable with ${priceImpact.toFixed(1)}% price impact`,
    };
  } catch (error) {
    return {
      check: 'HONEYPOT',
      status: 'unknown',
      score: 50,
      weight: RISK_WEIGHTS.HONEYPOT,
      details: { error: String(error) },
      message: 'Could not verify honeypot status',
    };
  }
}

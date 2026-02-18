import { PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import type {
  RiskCheckResult,
  RiskCheckType,
  RiskStatus,
  TokenMarketData,
  ExternalRiskData,
  ExtendedScanResponse,
  Platform,
} from '@trenchable/shared';
import { INSTANT_RISK_WEIGHTS, PROGRAM_IDS } from '@trenchable/shared';
import { getConnection } from '../config/rpc.js';
import { MemoryCache } from '../cache/memory-cache.js';
import { getRiskLevel } from '../scoring/risk-engine.js';
import { saveScanToHistory } from '../db/history.js';
import { saveLaunchSignals } from './token-tracker.service.js';

// External API clients
import { getAsset, extractTokenMeta, type HeliusAsset } from './external/helius.js';
import { getGoPlusTokenSecurity, extractGoPlusRiskFlags, extractGoPlusTrustSignals, type GoPlusResult } from './external/goplus.js';
import { getDexScreenerData, type DexScreenerData } from './external/dexscreener.js';
import { getRugcheckReport, extractRugcheckRisks, extractLpLockData, type RugcheckReport } from './external/rugcheck.js';

// MC Prediction
import { computeMCPrediction } from './mc-prediction.service.js';

const instantCache = new MemoryCache<ExtendedScanResponse>();

// ─── Instant Scan: external API data only, zero extra RPC calls ───

export async function runInstantScan(tokenMintStr: string): Promise<ExtendedScanResponse> {
  const cached = instantCache.get(tokenMintStr);
  if (cached) return cached;

  const startTime = Date.now();
  const connection = getConnection();
  const tokenMint = new PublicKey(tokenMintStr);

  // Single parallel phase — all external APIs + one getMint RPC call
  // No sleeps, no batches, no additional RPC
  const [mintInfoResult, heliusAsset, goPlusData, dexData, rugcheckReport] = await Promise.all([
    getMint(connection, tokenMint).catch(() => undefined),
    getAsset(tokenMintStr),
    getGoPlusTokenSecurity(tokenMintStr),
    getDexScreenerData(tokenMintStr),
    getRugcheckReport(tokenMintStr),
  ]);

  // Detect platform from external data (no RPC needed)
  const platform = detectPlatformFromExternal(rugcheckReport, dexData, tokenMintStr);

  // Derive all risk checks from external data
  const mintAuthResult = deriveMintAuth(goPlusData, heliusAsset, mintInfoResult);
  const freezeAuthResult = deriveFreezeAuth(goPlusData, heliusAsset, mintInfoResult);
  const lpResult = deriveLPStatus(rugcheckReport, dexData);
  const holderResult = deriveHolderConcentration(goPlusData, rugcheckReport);
  const honeypotResult = deriveHoneypot(goPlusData);
  const tokenTaxResult = deriveTokenTax(rugcheckReport, goPlusData);
  const devWalletResult = deriveDevWallet(goPlusData);
  const socialResult = deriveSocialSentiment(dexData, rugcheckReport);
  const rugPatternResult = deriveRugPattern(rugcheckReport, goPlusData, heliusAsset, dexData);

  const checks: RiskCheckResult[] = [
    mintAuthResult,
    freezeAuthResult,
    lpResult,
    holderResult,
    honeypotResult,
    tokenTaxResult,
    devWalletResult,
    socialResult,
    rugPatternResult,
  ];

  // Calculate score with instant weights
  const overallScore = calculateInstantScore(checks);

  // Extract metadata
  const heliusMeta = heliusAsset ? extractTokenMeta(heliusAsset) : null;
  const tokenImage = heliusMeta?.image || dexData?.imageUrl || null;
  const tokenName = heliusMeta?.name || dexData?.pairs?.[0]?.baseToken?.name || null;
  const tokenSymbol = heliusMeta?.symbol || dexData?.pairs?.[0]?.baseToken?.symbol || null;
  const tokenDescription = heliusMeta?.description || null;

  // Build market data
  let market: TokenMarketData | null = null;
  if (dexData) {
    market = {
      priceUsd: dexData.priceUsd,
      marketCap: dexData.marketCap,
      liquidity: dexData.liquidity,
      volume24h: dexData.volume24h,
      priceChange24h: dexData.priceChange24h,
      txns24h: dexData.txns24h,
      pairAge: dexData.pairAge,
      dexUrl: dexData.dexUrl,
    };
  }

  // Build external risk data
  const goPlusFlags = goPlusData ? extractGoPlusRiskFlags(goPlusData) : [];
  const goPlusTrust = goPlusData ? extractGoPlusTrustSignals(goPlusData) : [];
  const rugcheckFlags = rugcheckReport ? extractRugcheckRisks(rugcheckReport) : [];
  const rugcheckLp = rugcheckReport ? extractLpLockData(rugcheckReport) : null;

  let externalRisk: ExternalRiskData | null = null;
  if (goPlusData || rugcheckReport) {
    externalRisk = {
      goPlusFlags,
      goPlusTrust,
      rugcheckFlags,
      rugcheckScore: rugcheckReport?.score_normalised ?? null,
      rugcheckVerified: rugcheckReport?.verification?.jup_verified ?? null,
      lpLockedPct: rugcheckLp?.lpLockedPct ?? null,
      lpBurnedPct: rugcheckLp?.lpBurnedPct ?? null,
      insidersDetected: rugcheckReport?.graphInsidersDetected ?? null,
    };
  }

  const socials = dexData?.socials || [];
  const websites = dexData?.websites || [];

  // MC prediction
  const mcPrediction = computeMCPrediction(dexData, goPlusData, rugcheckReport);

  const response: ExtendedScanResponse = {
    tokenMint: tokenMintStr,
    tokenName,
    tokenSymbol,
    tokenImage,
    tokenDescription,
    overallScore,
    riskLevel: getRiskLevel(overallScore),
    checks,
    scanTimestamp: Date.now(),
    scanDurationMs: Date.now() - startTime,
    platform,
    market,
    externalRisk,
    socials,
    websites,
    scanMode: 'instant',
    mcPrediction,
  };

  // Cache for 30 seconds (instant results refresh faster)
  instantCache.set(tokenMintStr, response, 30_000);

  // Save to history (non-blocking)
  try { saveScanToHistory(response); } catch { /* ignore */ }

  // Save launch signals for MC prediction training (non-blocking)
  try { saveLaunchSignals(response); } catch { /* ignore */ }

  return response;
}

// ─── Platform detection from external data ───

function detectPlatformFromExternal(
  rugcheck: RugcheckReport | null,
  dexData: DexScreenerData | null,
  _mint: string
): Platform {
  // Rugcheck tells us the token program
  if (rugcheck?.tokenType === 'pump.fun') return 'pump.fun';

  // Check if any market is on Raydium
  if (rugcheck?.markets) {
    for (const m of rugcheck.markets) {
      if (m.marketType?.toLowerCase().includes('raydium')) return 'raydium';
      if (m.marketType?.toLowerCase().includes('meteora')) return 'meteora';
    }
  }

  // Check DexScreener pair dexId
  if (dexData?.pairs) {
    for (const p of dexData.pairs) {
      if (p.dexId?.toLowerCase().includes('raydium')) return 'raydium';
      if (p.dexId?.toLowerCase().includes('meteora')) return 'meteora';
    }
  }

  return 'unknown';
}

// ─── Risk check derivation functions (all from external API data only) ───

function makeCheck(
  check: RiskCheckType,
  status: RiskStatus,
  score: number,
  weight: number,
  message: string,
  details: Record<string, unknown> = {}
): RiskCheckResult {
  return { check, status, score, weight, message, details: { ...details, source: 'instant' } };
}

function deriveMintAuth(
  goplus: GoPlusResult | null,
  helius: HeliusAsset | null,
  mintInfo?: { mintAuthority: { toBase58(): string } | null }
): RiskCheckResult {
  const w = INSTANT_RISK_WEIGHTS.MINT_AUTHORITY;

  // Prefer on-chain getMint (it's in Phase 1 anyway)
  if (mintInfo) {
    const authority = mintInfo.mintAuthority?.toBase58() || null;
    const isRevoked = !authority;
    return makeCheck(
      'MINT_AUTHORITY',
      isRevoked ? 'safe' : 'danger',
      isRevoked ? 0 : 100,
      w,
      isRevoked
        ? 'Mint authority is revoked — no new tokens can be minted'
        : `Mint authority active (${authority}) — supply inflation risk`,
      { mintAuthority: authority, isRevoked }
    );
  }

  // GoPlus fallback
  if (goplus?.mintable) {
    const isMintable = goplus.mintable.status === '1';
    const authority = goplus.mintable.authority?.[0]?.address || null;
    return makeCheck(
      'MINT_AUTHORITY',
      isMintable ? 'danger' : 'safe',
      isMintable ? 100 : 0,
      w,
      isMintable
        ? `Mint authority active (${authority || 'unknown'}) — supply inflation risk`
        : 'Mint authority revoked (via GoPlus)',
      { mintAuthority: authority, isRevoked: !isMintable }
    );
  }

  // Helius fallback
  if (helius?.token_info) {
    const authority = helius.token_info.mint_authority;
    const isRevoked = !authority;
    return makeCheck(
      'MINT_AUTHORITY',
      isRevoked ? 'safe' : 'danger',
      isRevoked ? 0 : 100,
      w,
      isRevoked
        ? 'Mint authority revoked (via Helius)'
        : `Mint authority active (${authority}) — supply inflation risk`,
      { mintAuthority: authority || null, isRevoked }
    );
  }

  return makeCheck('MINT_AUTHORITY', 'unknown', 50, w, 'Could not determine mint authority status');
}

function deriveFreezeAuth(
  goplus: GoPlusResult | null,
  helius: HeliusAsset | null,
  mintInfo?: { freezeAuthority: { toBase58(): string } | null }
): RiskCheckResult {
  const w = INSTANT_RISK_WEIGHTS.FREEZE_AUTHORITY;

  if (mintInfo) {
    const authority = mintInfo.freezeAuthority?.toBase58() || null;
    const isRevoked = !authority;
    return makeCheck(
      'FREEZE_AUTHORITY',
      isRevoked ? 'safe' : 'danger',
      isRevoked ? 0 : 80,
      w,
      isRevoked
        ? 'Freeze authority revoked — wallets cannot be frozen'
        : `Freeze authority active (${authority}) — wallets can be frozen`,
      { freezeAuthority: authority, isRevoked }
    );
  }

  if (goplus?.freezable) {
    const isFreezable = goplus.freezable.status === '1';
    const authority = goplus.freezable.authority?.[0]?.address || null;
    return makeCheck(
      'FREEZE_AUTHORITY',
      isFreezable ? 'danger' : 'safe',
      isFreezable ? 80 : 0,
      w,
      isFreezable
        ? `Freeze authority active (${authority || 'unknown'}) — wallets can be frozen`
        : 'Freeze authority revoked (via GoPlus)',
      { freezeAuthority: authority, isRevoked: !isFreezable }
    );
  }

  if (helius?.token_info) {
    const authority = helius.token_info.freeze_authority;
    const isRevoked = !authority;
    return makeCheck(
      'FREEZE_AUTHORITY',
      isRevoked ? 'safe' : 'danger',
      isRevoked ? 0 : 80,
      w,
      isRevoked
        ? 'Freeze authority revoked (via Helius)'
        : `Freeze authority active (${authority}) — wallets can be frozen`,
      { freezeAuthority: authority || null, isRevoked }
    );
  }

  return makeCheck('FREEZE_AUTHORITY', 'unknown', 50, w, 'Could not determine freeze authority status');
}

function deriveLPStatus(
  rugcheck: RugcheckReport | null,
  dexData: DexScreenerData | null
): RiskCheckResult {
  const w = INSTANT_RISK_WEIGHTS.LP_STATUS;

  const rugcheckLp = rugcheck ? extractLpLockData(rugcheck) : null;
  const liquidityUsd = dexData?.liquidity || rugcheckLp?.totalLiquidity || null;

  if (rugcheckLp) {
    const totalSecured = rugcheckLp.lpLockedPct + rugcheckLp.lpBurnedPct;

    let score: number;
    let status: RiskStatus;
    let message: string;

    if (totalSecured > 95) {
      score = 5;
      status = 'safe';
      message = `LP ${totalSecured.toFixed(0)}% secured (${rugcheckLp.lpBurnedPct.toFixed(0)}% burned, ${rugcheckLp.lpLockedPct.toFixed(0)}% locked)`;
    } else if (totalSecured > 75) {
      score = 15;
      status = 'safe';
      message = `LP ${totalSecured.toFixed(0)}% secured — mostly locked/burned`;
    } else if (totalSecured > 50) {
      score = 30;
      status = 'warning';
      message = `LP ${totalSecured.toFixed(0)}% secured — partially locked/burned`;
    } else if (totalSecured > 10) {
      score = 60;
      status = 'warning';
      message = `LP only ${totalSecured.toFixed(0)}% secured — majority unlocked`;
    } else {
      score = 90;
      status = 'danger';
      message = 'LP is NOT locked or burned — high rug pull risk';
    }

    return makeCheck('LP_STATUS', status, score, w, message, {
      lpLockedPct: rugcheckLp.lpLockedPct,
      lpBurnedPct: rugcheckLp.lpBurnedPct,
      totalSecuredPct: totalSecured,
      liquidityUsd,
    });
  }

  // No rugcheck LP data — check if there's at least liquidity
  if (liquidityUsd && liquidityUsd > 1000) {
    return makeCheck('LP_STATUS', 'warning', 50, w,
      `Liquidity: $${liquidityUsd.toLocaleString()} — LP lock status unknown`,
      { liquidityUsd }
    );
  }

  return makeCheck('LP_STATUS', 'danger', 80, w, 'No LP data available — cannot verify liquidity');
}

function deriveHolderConcentration(
  goplus: GoPlusResult | null,
  rugcheck: RugcheckReport | null
): RiskCheckResult {
  const w = INSTANT_RISK_WEIGHTS.TOP_HOLDERS;

  // Prefer Rugcheck — has insider flags
  if (rugcheck?.topHolders && rugcheck.topHolders.length > 0) {
    const holders = rugcheck.topHolders;
    const topPct = holders[0]?.pct || 0;
    const top10Pct = holders.slice(0, 10).reduce((sum, h) => sum + (h.pct || 0), 0);
    const insiderCount = holders.filter(h => h.insider).length;

    let score: number;
    let status: RiskStatus;
    let message: string;

    if (topPct > 15) {
      score = 95;
      status = 'danger';
      message = `Top holder owns ${topPct.toFixed(1)}% — extreme concentration`;
    } else if (top10Pct > 75) {
      score = 90;
      status = 'danger';
      message = `Top 10 holders own ${top10Pct.toFixed(1)}% — very high concentration`;
    } else if (top10Pct > 50) {
      score = 50;
      status = 'warning';
      message = `Top 10 own ${top10Pct.toFixed(1)}%${insiderCount > 0 ? ` (${insiderCount} insiders)` : ''}`;
    } else if (top10Pct > 30) {
      score = 25;
      status = 'warning';
      message = `Top 10 own ${top10Pct.toFixed(1)}% — slight concentration`;
    } else {
      score = 0;
      status = 'safe';
      message = `Top 10 own ${top10Pct.toFixed(1)}% — well distributed`;
    }

    return makeCheck('TOP_HOLDERS', status, score, w, message, {
      top1Pct: topPct,
      top10Pct,
      insiderCount,
      holders: holders.slice(0, 5).map(h => ({
        address: h.address,
        percentage: h.pct.toFixed(2),
        insider: h.insider,
      })),
    });
  }

  // GoPlus fallback
  if (goplus?.holders && goplus.holders.length > 0) {
    const holders = goplus.holders;
    const topPct = parseFloat(holders[0]?.percent || '0') * 100;
    const top10Pct = holders.slice(0, 10).reduce((sum, h) => sum + parseFloat(h.percent || '0'), 0) * 100;

    let score: number;
    let status: RiskStatus;
    let message: string;

    if (topPct > 15) {
      score = 95; status = 'danger';
      message = `Top holder owns ${topPct.toFixed(1)}% — extreme concentration (GoPlus)`;
    } else if (top10Pct > 75) {
      score = 90; status = 'danger';
      message = `Top 10 own ${top10Pct.toFixed(1)}% — very high concentration (GoPlus)`;
    } else if (top10Pct > 50) {
      score = 50; status = 'warning';
      message = `Top 10 own ${top10Pct.toFixed(1)}% (GoPlus)`;
    } else if (top10Pct > 30) {
      score = 25; status = 'warning';
      message = `Top 10 own ${top10Pct.toFixed(1)}% — slight concentration (GoPlus)`;
    } else {
      score = 0; status = 'safe';
      message = `Top 10 own ${top10Pct.toFixed(1)}% — well distributed (GoPlus)`;
    }

    return makeCheck('TOP_HOLDERS', status, score, w, message, {
      top1Pct: topPct,
      top10Pct,
      holderCount: goplus.holder_count,
    });
  }

  return makeCheck('TOP_HOLDERS', 'unknown', 50, w, 'No holder data available');
}

function deriveHoneypot(goplus: GoPlusResult | null): RiskCheckResult {
  const w = INSTANT_RISK_WEIGHTS.HONEYPOT;

  if (!goplus) {
    return makeCheck('HONEYPOT', 'unknown', 50, w, 'Could not check honeypot status');
  }

  const isHoneypot = goplus.is_honeypot === '1';
  const cannotSellAll = goplus.cannot_sell_all === '1';
  const cannotBuy = goplus.cannot_buy === '1';
  const buyTax = parseFloat(goplus.buy_tax || '0');
  const sellTax = parseFloat(goplus.sell_tax || '0');

  if (isHoneypot) {
    return makeCheck('HONEYPOT', 'danger', 100, w,
      'HONEYPOT CONFIRMED — token CANNOT be sold',
      { isHoneypot, cannotSellAll, buyTax, sellTax }
    );
  }

  if (cannotSellAll || cannotBuy) {
    return makeCheck('HONEYPOT', 'danger', 80, w,
      `Selling restrictions detected${cannotBuy ? ' — cannot buy' : ' — cannot sell all'}`,
      { isHoneypot, cannotSellAll, cannotBuy, buyTax, sellTax }
    );
  }

  if (sellTax > 0.10) {
    return makeCheck('HONEYPOT', 'warning', 60, w,
      `High sell tax: ${(sellTax * 100).toFixed(1)}%`,
      { isHoneypot, buyTax, sellTax }
    );
  }

  if (sellTax > 0.05) {
    return makeCheck('HONEYPOT', 'warning', 35, w,
      `Moderate sell tax: ${(sellTax * 100).toFixed(1)}%`,
      { isHoneypot, buyTax, sellTax }
    );
  }

  return makeCheck('HONEYPOT', 'safe', 0, w,
    'Token is sellable with normal tax rates',
    { isHoneypot: false, buyTax, sellTax }
  );
}

function deriveTokenTax(
  rugcheck: RugcheckReport | null,
  goplus: GoPlusResult | null
): RiskCheckResult {
  const w = INSTANT_RISK_WEIGHTS.TOKEN_TAX;

  // Rugcheck transfer fee (Token-2022 extension)
  if (rugcheck?.transferFee && rugcheck.transferFee.pct > 0) {
    const feePct = rugcheck.transferFee.pct;
    const feeBps = feePct * 100;

    if (feeBps >= 2000) {
      return makeCheck('TOKEN_TAX', 'danger', 100, w,
        `Transfer fee: ${feePct.toFixed(1)}% — extremely high`,
        { transferFeePct: feePct, feeType: 'Token-2022' }
      );
    }
    if (feeBps >= 500) {
      return makeCheck('TOKEN_TAX', 'danger', 75, w,
        `Transfer fee: ${feePct.toFixed(1)}% — suspicious`,
        { transferFeePct: feePct, feeType: 'Token-2022' }
      );
    }
    return makeCheck('TOKEN_TAX', 'warning', 30, w,
      `Transfer fee: ${feePct.toFixed(2)}%`,
      { transferFeePct: feePct, feeType: 'Token-2022' }
    );
  }

  // GoPlus tax data
  if (goplus) {
    const buyTax = parseFloat(goplus.buy_tax || '0');
    const sellTax = parseFloat(goplus.sell_tax || '0');
    const maxTax = Math.max(buyTax, sellTax);

    if (maxTax > 0.20) {
      return makeCheck('TOKEN_TAX', 'danger', 90, w,
        `Extreme tax: buy ${(buyTax * 100).toFixed(1)}% / sell ${(sellTax * 100).toFixed(1)}%`,
        { buyTax, sellTax }
      );
    }
    if (maxTax > 0.05) {
      return makeCheck('TOKEN_TAX', 'warning', 40, w,
        `Tax: buy ${(buyTax * 100).toFixed(1)}% / sell ${(sellTax * 100).toFixed(1)}%`,
        { buyTax, sellTax }
      );
    }
    return makeCheck('TOKEN_TAX', 'safe', 0, w,
      'No significant transfer taxes',
      { buyTax, sellTax }
    );
  }

  return makeCheck('TOKEN_TAX', 'safe', 0, w, 'Standard SPL token — no transfer fee');
}

function deriveDevWallet(goplus: GoPlusResult | null): RiskCheckResult {
  const w = INSTANT_RISK_WEIGHTS.DEV_WALLET;

  if (!goplus?.creator_address) {
    return makeCheck('DEV_WALLET', 'unknown', 50, w, 'Could not determine dev wallet');
  }

  const creatorPct = parseFloat(goplus.creator_percent || '0') * 100;
  const ownerPct = parseFloat(goplus.owner_percent || '0') * 100;
  const maxPct = Math.max(creatorPct, ownerPct);

  if (maxPct > 10) {
    return makeCheck('DEV_WALLET', 'danger', 90, w,
      `Creator holds ${creatorPct.toFixed(1)}% — very high dump risk`,
      { creator: goplus.creator_address, creatorPercent: creatorPct, ownerPercent: ownerPct }
    );
  }
  if (maxPct > 5) {
    return makeCheck('DEV_WALLET', 'danger', 70, w,
      `Creator holds ${creatorPct.toFixed(1)}% — significant dump risk`,
      { creator: goplus.creator_address, creatorPercent: creatorPct, ownerPercent: ownerPct }
    );
  }
  if (maxPct > 1) {
    return makeCheck('DEV_WALLET', 'warning', 40, w,
      `Creator holds ${creatorPct.toFixed(1)}%`,
      { creator: goplus.creator_address, creatorPercent: creatorPct, ownerPercent: ownerPct }
    );
  }
  return makeCheck('DEV_WALLET', 'safe', 5, w,
    `Creator holds ${creatorPct.toFixed(2)}% — minimal risk`,
    { creator: goplus.creator_address, creatorPercent: creatorPct, ownerPercent: ownerPct }
  );
}

function deriveSocialSentiment(
  dexData: DexScreenerData | null,
  rugcheck: RugcheckReport | null
): RiskCheckResult {
  const w = INSTANT_RISK_WEIGHTS.SOCIAL_SENTIMENT;

  const hasTwitter = dexData?.socials?.some(s => s.type === 'twitter') || false;
  const hasTelegram = dexData?.socials?.some(s => s.type === 'telegram') || false;
  const hasWebsite = (dexData?.websites?.length || 0) > 0;
  const isVerified = rugcheck?.verification?.jup_verified === true;

  const socialCount = [hasWebsite, hasTwitter, hasTelegram].filter(Boolean).length;

  if (isVerified || socialCount >= 3) {
    return makeCheck('SOCIAL_SENTIMENT', 'safe', 0, w,
      isVerified ? 'Jupiter verified with full social presence' : 'Website, Twitter, and Telegram present',
      { hasWebsite, hasTwitter, hasTelegram, jupVerified: isVerified, socialCount }
    );
  }
  if (socialCount >= 2) {
    return makeCheck('SOCIAL_SENTIMENT', 'safe', 15, w,
      `${socialCount}/3 social links — decent presence`,
      { hasWebsite, hasTwitter, hasTelegram, socialCount }
    );
  }
  if (socialCount === 1) {
    return makeCheck('SOCIAL_SENTIMENT', 'warning', 45, w,
      'Minimal social presence — only 1 link found',
      { hasWebsite, hasTwitter, hasTelegram, socialCount }
    );
  }
  return makeCheck('SOCIAL_SENTIMENT', 'warning', 70, w,
    'No social links found — anonymous token',
    { hasWebsite: false, hasTwitter: false, hasTelegram: false, socialCount: 0 }
  );
}

function deriveRugPattern(
  rugcheck: RugcheckReport | null,
  goplus: GoPlusResult | null,
  helius: HeliusAsset | null,
  dexData: DexScreenerData | null
): RiskCheckResult {
  const w = INSTANT_RISK_WEIGHTS.RUG_PATTERN;

  // This absorbs WALLET_CLUSTER, SNIPER_BOTS, and BUNDLE_DETECTION signals
  let score = 0;
  let flags: string[] = [];
  const details: Record<string, unknown> = {};

  // 1. Rugcheck confirmed rug — instant max score
  if (rugcheck?.rugged) {
    return makeCheck('RUG_PATTERN', 'danger', 100, w,
      'CONFIRMED RUG — Rugcheck has flagged this token',
      { rugged: true, flags: ['CONFIRMED RUG'] }
    );
  }

  // 2. Rugcheck risk flags
  if (rugcheck?.risks) {
    for (const risk of rugcheck.risks) {
      if (risk.level === 'danger' || risk.level === 'error' || risk.score >= 5000) {
        flags.push(`${risk.name}: ${risk.description}`);
        score += 15;
      } else if (risk.level === 'warn') {
        flags.push(`${risk.name}: ${risk.description}`);
        score += 5;
      }
    }
  }

  // 3. Insider detection (replaces WALLET_CLUSTER + BUNDLE_DETECTION)
  const insiders = rugcheck?.graphInsidersDetected || 0;
  if (insiders > 5) {
    score += 30;
    flags.push(`${insiders} insider wallets detected (bundled/coordinated)`);
    details.insidersDetected = insiders;
  } else if (insiders > 2) {
    score += 15;
    flags.push(`${insiders} insider wallets detected`);
    details.insidersDetected = insiders;
  } else if (insiders > 0) {
    score += 5;
    details.insidersDetected = insiders;
  }

  // 4. GoPlus flags (replace SNIPER_BOTS + additional pattern signals)
  if (goplus) {
    if (goplus.honeypot_with_same_creator && parseInt(goplus.honeypot_with_same_creator) > 0) {
      score += 25;
      flags.push(`Creator has ${goplus.honeypot_with_same_creator} other honeypot(s)`);
    }
    if (goplus.is_airdrop_scam === '1') {
      score += 20;
      flags.push('Airdrop scam detected');
    }
    if (goplus.fake_token && goplus.fake_token.value > 0) {
      score += 20;
      flags.push('Fake/counterfeit token');
    }
    if (goplus.hidden_owner === '1') {
      score += 10;
      flags.push('Hidden owner detected');
    }
    if (goplus.owner_change_balance === '1') {
      score += 15;
      flags.push('Owner can change balances');
    }
    if (goplus.external_call === '1') {
      score += 10;
      flags.push('External contract calls detected');
    }
  }

  // 5. Suspicious name patterns (use Helius or GoPlus metadata)
  const tokenName = helius?.content?.metadata?.name || goplus?.token_name || dexData?.pairs?.[0]?.baseToken?.name || '';
  if (tokenName) {
    const suspiciousPatterns = [/test/i, /rug/i, /scam/i, /fake/i, /honeypot/i, /airdrop/i, /free.*money/i];
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(tokenName)) {
        score += 10;
        flags.push(`Suspicious name pattern: "${tokenName}"`);
        break;
      }
    }
  }

  // Cap at 100
  score = Math.min(score, 100);

  let status: RiskStatus;
  let message: string;
  if (score >= 70) {
    status = 'danger';
    message = flags.length > 0 ? flags[0] : 'Multiple risk patterns detected';
  } else if (score >= 30) {
    status = 'warning';
    message = flags.length > 0 ? `${flags.length} risk signal(s): ${flags[0]}` : 'Some risk patterns detected';
  } else {
    status = 'safe';
    message = 'No significant rug patterns detected';
  }

  details.flags = flags;
  details.rugcheckScore = rugcheck?.score_normalised ?? null;

  return makeCheck('RUG_PATTERN', status, score, w, message, details);
}

// ─── Instant score calculation ───

function calculateInstantScore(checks: RiskCheckResult[]): number {
  let totalScore = 0;
  let totalWeight = 0;

  for (const result of checks) {
    if (result.status !== 'unknown') {
      totalScore += result.score * result.weight;
      totalWeight += result.weight;
    }
  }

  let normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 50;

  // Critical overrides
  const honeypot = checks.find(r => r.check === 'HONEYPOT');
  if (honeypot && honeypot.score >= 90) {
    normalizedScore = Math.max(normalizedScore, 90);
  }

  const mintAuth = checks.find(r => r.check === 'MINT_AUTHORITY');
  if (mintAuth && mintAuth.score >= 90) {
    normalizedScore = Math.max(normalizedScore, 75);
  }

  const rugPattern = checks.find(r => r.check === 'RUG_PATTERN');
  if (rugPattern && rugPattern.score >= 100) {
    normalizedScore = 100; // Confirmed rug
  }

  return Math.round(normalizedScore);
}

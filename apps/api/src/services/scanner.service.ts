import { PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import type { ScanResponse, Platform, RiskCheckResult, TokenMarketData, ExternalRiskData } from '@trenchable/shared';
import { PROGRAM_IDS } from '@trenchable/shared';
import { getConnection } from '../config/rpc.js';
import { config } from '../config/env.js';
import { MemoryCache } from '../cache/memory-cache.js';
import { calculateOverallScore, getRiskLevel } from '../scoring/risk-engine.js';
import { checkMintAuthority } from './mint-authority.service.js';
import { checkFreezeAuthority } from './freeze-authority.service.js';
import { checkLPStatus } from './lp-status.service.js';
import { checkHolderConcentration } from './holder-analysis.service.js';
import { checkHoneypot } from './honeypot.service.js';
import { checkDevWallet } from './dev-wallet.service.js';
import { checkBundleDetection } from './bundle-detect.service.js';
import { checkWalletClusters } from './wallet-cluster.service.js';
import { checkSocialSentiment } from './social-sentiment.service.js';
import { checkRugPattern } from './rug-pattern.service.js';
import { checkTokenTax } from './token-tax.service.js';
import { checkSniperBots } from './sniper-bot.service.js';
import { saveScanToHistory } from '../db/history.js';
import type { ScanContext } from '../types/risk.types.js';

// External API clients
import { getAsset, extractTokenMeta } from './external/helius.js';
import { getGoPlusTokenSecurity, extractGoPlusRiskFlags, extractGoPlusTrustSignals } from './external/goplus.js';
import { getDexScreenerData, type DexScreenerData } from './external/dexscreener.js';
import { getRugcheckReport, extractRugcheckRisks, extractLpLockData, type RugcheckReport } from './external/rugcheck.js';
import type { GoPlusResult } from './external/goplus.js';

const scanCache = new MemoryCache<ScanResponse>();

async function detectPlatform(ctx: ScanContext): Promise<Platform> {
  try {
    const [bondingCurve] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), ctx.tokenMint.toBuffer()],
      new PublicKey(PROGRAM_IDS.PUMP_FUN)
    );
    const bcInfo = await ctx.connection.getAccountInfo(bondingCurve);
    if (bcInfo) return 'pump.fun';

    const raydiumAccounts = await ctx.connection.getProgramAccounts(
      new PublicKey(PROGRAM_IDS.RAYDIUM_V4_AMM),
      {
        filters: [
          { dataSize: 752 },
          { memcmp: { offset: 400, bytes: ctx.tokenMint.toBase58() } },
        ],
        dataSlice: { offset: 0, length: 0 },
      }
    );
    if (raydiumAccounts.length > 0) return 'raydium';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// Small delay helper to stagger RPC calls and avoid rate limits
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function runScan(tokenMintStr: string): Promise<ScanResponse> {
  const cached = scanCache.get(tokenMintStr);
  if (cached) return cached;

  const startTime = Date.now();
  const connection = getConnection();
  const tokenMint = new PublicKey(tokenMintStr);

  // Phase 1: Fetch mint info FIRST (needed by many checks) + external APIs (no RPC)
  // External APIs don't hit Solana RPC, so they can always run in parallel
  const [mintInfoResult, heliusAsset, goPlusData, dexData, rugcheckReport] = await Promise.all([
    getMint(connection, tokenMint).catch(() => undefined),
    getAsset(tokenMintStr),
    getGoPlusTokenSecurity(tokenMintStr),
    getDexScreenerData(tokenMintStr),
    getRugcheckReport(tokenMintStr),
  ]);

  // If getMint failed on RPC, try to reconstruct basic info from GoPlus/Helius
  let mintInfo = mintInfoResult;
  if (!mintInfo && goPlusData) {
    // We can still determine mint/freeze authority from GoPlus
    // But leave mintInfo undefined — the checks will use GoPlus fallback
  }
  const ctx: ScanContext = { tokenMint, mintInfo, connection };

  // Phase 2: Run ALL on-chain checks in parallel (no artificial delays)
  // Previous batched approach with 800ms of sleeps removed for speed.
  // If you hit rate limits on a free-tier RPC, consider upgrading to a paid endpoint.

  // Batch A+B: Simple + medium checks (all run in parallel)
  const [
    mintAuthResult,
    freezeAuthResult,
    tokenTaxResult,
    platform,
    lpStatusResult,
    holderResult,
    honeypotResult,
    socialResult,
  ] = await Promise.all([
    checkMintAuthority(ctx),
    checkFreezeAuthority(ctx),
    checkTokenTax(ctx),
    detectPlatform(ctx),
    checkLPStatus(ctx),
    checkHolderConcentration(ctx),
    checkHoneypot(ctx),
    checkSocialSentiment(ctx),
  ]);

  // Batch C: Heavy checks (still parallel, but after A+B to spread RPC load slightly)
  const [
    devWalletResult,
    bundleResult,
    walletClusterResult,
    rugPatternResult,
    sniperResult,
  ] = await Promise.all([
    checkDevWallet(ctx),
    checkBundleDetection(ctx),
    checkWalletClusters(ctx),
    checkRugPattern(ctx),
    checkSniperBots(ctx),
  ]);

  // Extract token metadata from Helius DAS (best source for name/image)
  const heliusMeta = heliusAsset ? extractTokenMeta(heliusAsset) : null;

  // Fallback chain for metadata
  const tokenImage = heliusMeta?.image || dexData?.imageUrl || null;
  const tokenName = heliusMeta?.name || dexData?.pairs?.[0]?.baseToken?.name || null;
  const tokenSymbol = heliusMeta?.symbol || dexData?.pairs?.[0]?.baseToken?.symbol || null;
  const tokenDescription = heliusMeta?.description || null;

  // Build market data from DexScreener
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

  // Build external risk data from GoPlus + Rugcheck
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

  // Collect socials
  const socials = dexData?.socials || [];
  const websites = dexData?.websites || [];

  // Enhance individual risk checks with external data
  const checks = [
    enhanceMintAuthCheck(mintAuthResult, goPlusData, heliusAsset),
    enhanceFreezeAuthCheck(freezeAuthResult, goPlusData, heliusAsset),
    enhanceLPCheck(lpStatusResult, rugcheckLp, dexData),
    enhanceHolderCheck(holderResult, goPlusData),
    enhanceHoneypotCheck(honeypotResult, goPlusData),
    enhanceDevWalletCheck(devWalletResult, goPlusData),
    bundleResult,
    walletClusterResult,
    enhanceSocialCheck(socialResult, dexData, rugcheckReport),
    enhanceRugPatternCheck(rugPatternResult, goPlusFlags, rugcheckFlags, rugcheckReport),
    tokenTaxResult,
    sniperResult,
  ];

  const overallScore = calculateOverallScore(checks);

  const response: ScanResponse = {
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
  };

  scanCache.set(tokenMintStr, response, config.cache.scanTtlMs);

  // Save to history (non-blocking)
  try { saveScanToHistory(response); } catch { /* ignore */ }

  return response;
}

// --- Enhancement functions that merge external API data into individual checks ---

import type { HeliusAsset } from './external/helius.js';

function enhanceMintAuthCheck(
  original: RiskCheckResult,
  goPlusData: GoPlusResult | null,
  heliusAsset: HeliusAsset | null
): RiskCheckResult {
  // If the RPC check succeeded, keep it
  if (original.status !== 'unknown') return original;

  // Fallback: use GoPlus mintable status
  if (goPlusData?.mintable) {
    const isMintable = goPlusData.mintable.status === '1';
    const authority = goPlusData.mintable.authority?.[0]?.address || null;
    return {
      ...original,
      status: isMintable ? 'danger' : 'safe',
      score: isMintable ? 100 : 0,
      details: { mintAuthority: authority, isRevoked: !isMintable, source: 'GoPlus' },
      message: isMintable
        ? `Mint authority is active (${authority || 'unknown'}) — more tokens can be minted`
        : 'Mint authority is revoked — no new tokens can be minted (via GoPlus)',
    };
  }

  // Fallback: use Helius DAS mint_authority
  if (heliusAsset?.token_info) {
    const authority = heliusAsset.token_info.mint_authority;
    const isRevoked = !authority;
    return {
      ...original,
      status: isRevoked ? 'safe' : 'danger',
      score: isRevoked ? 0 : 100,
      details: { mintAuthority: authority || null, isRevoked, source: 'Helius' },
      message: isRevoked
        ? 'Mint authority is revoked — no new tokens can be minted (via Helius)'
        : `Mint authority is active (${authority}) — more tokens can be minted`,
    };
  }

  return original;
}

function enhanceFreezeAuthCheck(
  original: RiskCheckResult,
  goPlusData: GoPlusResult | null,
  heliusAsset: HeliusAsset | null
): RiskCheckResult {
  if (original.status !== 'unknown') return original;

  // Fallback: use GoPlus freezable status
  if (goPlusData?.freezable) {
    const isFreezable = goPlusData.freezable.status === '1';
    const authority = goPlusData.freezable.authority?.[0]?.address || null;
    return {
      ...original,
      status: isFreezable ? 'danger' : 'safe',
      score: isFreezable ? 80 : 0,
      details: { freezeAuthority: authority, isRevoked: !isFreezable, source: 'GoPlus' },
      message: isFreezable
        ? `Freeze authority is active (${authority || 'unknown'}) — holder wallets can be frozen`
        : 'Freeze authority is revoked — wallets cannot be frozen (via GoPlus)',
    };
  }

  // Fallback: use Helius DAS freeze_authority
  if (heliusAsset?.token_info) {
    const authority = heliusAsset.token_info.freeze_authority;
    const isRevoked = !authority;
    return {
      ...original,
      status: isRevoked ? 'safe' : 'danger',
      score: isRevoked ? 0 : 80,
      details: { freezeAuthority: authority || null, isRevoked, source: 'Helius' },
      message: isRevoked
        ? 'Freeze authority is revoked — wallets cannot be frozen (via Helius)'
        : `Freeze authority is active (${authority}) — holder wallets can be frozen`,
    };
  }

  return original;
}

function enhanceHolderCheck(
  original: RiskCheckResult,
  goPlusData: GoPlusResult | null
): RiskCheckResult {
  if (original.status !== 'unknown' || !goPlusData?.holders?.length) return original;

  // Use GoPlus holder data as fallback
  const holders = goPlusData.holders;
  const topPct = parseFloat(holders[0]?.percent || '0') * 100;
  const top10Pct = holders.slice(0, 10).reduce((sum, h) => sum + parseFloat(h.percent || '0'), 0) * 100;

  let score: number;
  let status: 'safe' | 'warning' | 'danger';
  let message: string;

  if (topPct > 15) {
    score = 95;
    status = 'danger';
    message = `Top holder owns ${topPct.toFixed(1)}% of supply — extreme concentration risk (via GoPlus)`;
  } else if (top10Pct > 75) {
    score = 90;
    status = 'danger';
    message = `Top 10 holders own ${top10Pct.toFixed(1)}% — very high concentration (via GoPlus)`;
  } else if (top10Pct > 50) {
    score = 50;
    status = 'warning';
    message = `Top 10 holders own ${top10Pct.toFixed(1)}% — moderate concentration (via GoPlus)`;
  } else if (top10Pct > 30) {
    score = 25;
    status = 'warning';
    message = `Top 10 holders own ${top10Pct.toFixed(1)}% — slight concentration (via GoPlus)`;
  } else {
    score = 0;
    status = 'safe';
    message = `Top 10 holders own ${top10Pct.toFixed(1)}% — well distributed (via GoPlus)`;
  }

  return {
    ...original,
    score,
    status,
    message,
    details: {
      source: 'GoPlus',
      holderCount: goPlusData.holder_count,
      top1Pct: topPct,
      top10Pct,
      holders: holders.slice(0, 5).map(h => ({
        address: h.address,
        percentage: (parseFloat(h.percent || '0') * 100).toFixed(2),
        locked: h.is_locked === 1,
      })),
    },
  };
}

function enhanceDevWalletCheck(
  original: RiskCheckResult,
  goPlusData: GoPlusResult | null
): RiskCheckResult {
  if (original.status !== 'unknown' || !goPlusData) return original;

  const creatorPct = parseFloat(goPlusData.creator_percent || '0') * 100;
  const creatorAddr = goPlusData.creator_address;
  const ownerPct = parseFloat(goPlusData.owner_percent || '0') * 100;

  if (!creatorAddr) return original;

  let score: number;
  let status: 'safe' | 'warning' | 'danger';
  let message: string;

  if (creatorPct > 5 || ownerPct > 5) {
    score = 80;
    status = 'danger';
    message = `Creator holds ${creatorPct.toFixed(1)}% of supply — high risk (via GoPlus)`;
  } else if (creatorPct > 1 || ownerPct > 1) {
    score = 40;
    status = 'warning';
    message = `Creator holds ${creatorPct.toFixed(1)}% of supply (via GoPlus)`;
  } else {
    score = 0;
    status = 'safe';
    message = `Creator holds ${creatorPct.toFixed(2)}% of supply — minimal risk (via GoPlus)`;
  }

  return {
    ...original,
    score,
    status,
    message,
    details: {
      source: 'GoPlus',
      creator: creatorAddr,
      creatorPercent: creatorPct,
      ownerPercent: ownerPct,
      creatorBalance: goPlusData.creator_balance,
    },
  };
}

function enhanceLPCheck(
  original: RiskCheckResult,
  rugcheckLp: { lpLockedPct: number; lpBurnedPct: number; totalLiquidity: number } | null,
  dexData: DexScreenerData | null
): RiskCheckResult {
  if (!rugcheckLp && !dexData) return original;

  const details = { ...original.details };
  let { score, status, message } = original;

  if (rugcheckLp) {
    details.rugcheckLpLockedPct = rugcheckLp.lpLockedPct;
    details.rugcheckLpBurnedPct = rugcheckLp.lpBurnedPct;
    details.rugcheckTotalLiquidity = rugcheckLp.totalLiquidity;

    const totalSecured = rugcheckLp.lpLockedPct + rugcheckLp.lpBurnedPct;

    if (totalSecured > 95 && score > 10) {
      score = 5;
      status = 'safe';
      message = `LP is ${totalSecured.toFixed(0)}% secured (${rugcheckLp.lpBurnedPct.toFixed(0)}% burned, ${rugcheckLp.lpLockedPct.toFixed(0)}% locked)`;
    } else if (totalSecured > 50 && score > 40) {
      score = 30;
      status = 'warning';
      message = `LP is ${totalSecured.toFixed(0)}% secured — partially locked/burned`;
    }
  }

  if (dexData?.liquidity) {
    details.liquidityUsd = dexData.liquidity;
  }

  return { ...original, score, status, message, details };
}

function enhanceHoneypotCheck(
  original: RiskCheckResult,
  goPlusData: GoPlusResult | null
): RiskCheckResult {
  if (!goPlusData) return original;

  const details = { ...original.details };
  const isGoPlusHoneypot = goPlusData.is_honeypot === '1';
  const cannotSellAll = goPlusData.cannot_sell_all === '1';
  const buyTax = parseFloat(goPlusData.buy_tax || '0');
  const sellTax = parseFloat(goPlusData.sell_tax || '0');

  details.goPlusHoneypot = isGoPlusHoneypot;
  details.goPlusBuyTax = buyTax;
  details.goPlusSellTax = sellTax;
  details.goPlusCannotSellAll = cannotSellAll;

  let { score, status, message } = original;

  if (isGoPlusHoneypot && score < 80) {
    score = 90;
    status = 'danger';
    message = 'GoPlus confirms: Token is a honeypot — CANNOT be sold';
  } else if (cannotSellAll && score < 60) {
    score = 70;
    status = 'danger';
    message = 'GoPlus: Selling restrictions detected — may not be able to sell all tokens';
  } else if (sellTax > 0.10 && score < 50) {
    score = Math.max(score, 50);
    status = 'warning';
    message = `GoPlus: High sell tax detected (${(sellTax * 100).toFixed(1)}%)`;
  }

  if (!isGoPlusHoneypot && !cannotSellAll && sellTax < 0.05 && original.status === 'unknown') {
    score = 10;
    status = 'safe';
    message = 'GoPlus confirms: Token is sellable with normal tax rates';
  }

  return { ...original, score, status, message, details };
}

function enhanceSocialCheck(
  original: RiskCheckResult,
  dexData: DexScreenerData | null,
  rugcheckReport: RugcheckReport | null
): RiskCheckResult {
  if (!dexData && !rugcheckReport) return original;

  const details = { ...original.details };
  let { score, status, message } = original;

  const twitterSocial = dexData?.socials?.find(s => s.type === 'twitter');
  const telegramSocial = dexData?.socials?.find(s => s.type === 'telegram');

  if (dexData?.websites && dexData.websites.length > 0) details.hasWebsite = true;
  if (twitterSocial) details.hasTwitter = true;
  if (telegramSocial) details.hasTelegram = true;
  if (dexData?.socials) details.dexScreenerSocials = dexData.socials;
  if (dexData?.websites) details.dexScreenerWebsites = dexData.websites;

  const isVerified = rugcheckReport?.verification?.jup_verified === true;
  if (isVerified) details.jupiterVerified = true;

  const socialCount = [details.hasWebsite, details.hasTwitter, details.hasTelegram].filter(Boolean).length;

  if (socialCount >= 3 || isVerified) {
    score = 0;
    status = 'safe';
    message = isVerified
      ? 'Jupiter verified token with full social presence'
      : 'Token has website, Twitter, and Telegram — good social presence';
  } else if (socialCount >= 2) {
    score = 15;
    status = 'safe';
    message = `Token has ${socialCount}/3 social links — decent presence`;
  } else if (socialCount === 1) {
    score = 45;
    status = 'warning';
    message = 'Minimal social presence — only 1 link found';
  }

  return { ...original, score, status, message, details };
}

function enhanceRugPatternCheck(
  original: RiskCheckResult,
  goPlusFlags: string[],
  rugcheckFlags: string[],
  rugcheckReport: RugcheckReport | null
): RiskCheckResult {
  const details = { ...original.details };
  let { score, status, message } = original;

  const allExternalFlags = [...goPlusFlags, ...rugcheckFlags];
  details.externalFlags = allExternalFlags;

  if (rugcheckReport?.rugged) {
    score = 100;
    status = 'danger';
    message = 'Rugcheck confirms: This token has been RUGGED';
    details.flags = [...(details.flags as string[] || []), 'CONFIRMED RUG by Rugcheck'];
  }

  if (rugcheckReport?.graphInsidersDetected && rugcheckReport.graphInsidersDetected > 0) {
    details.insidersDetected = rugcheckReport.graphInsidersDetected;
  }

  const criticalFlags = allExternalFlags.filter(f =>
    /honeypot|cannot|rugged|scam|fake/i.test(f)
  );

  if (criticalFlags.length > 0 && score < 80) {
    score = Math.max(score, 80);
    status = 'danger';
    message = `${criticalFlags.length} critical risk(s) flagged by external security APIs`;
  } else if (allExternalFlags.length > 3 && score < 50) {
    score = Math.max(score, 50);
    status = 'warning';
    message = `${allExternalFlags.length} risk flags from GoPlus/Rugcheck`;
  }

  return { ...original, score, status, message, details };
}

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  labels: string[];
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative: string;
  priceUsd: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: { h24: number; h6: number; h1: number; m5: number };
  priceChange: { h1?: number; h6?: number; h24?: number; m5?: number };
  liquidity: { usd: number; base: number; quote: number };
  fdv: number;
  marketCap: number;
  pairCreatedAt: number;
  info?: {
    imageUrl?: string;
    header?: string;
    websites?: { label: string; url: string }[];
    socials?: { type: string; url: string }[];
  };
}

export interface DexScreenerData {
  pairs: DexScreenerPair[];
  // Aggregated from best pair
  priceUsd: number | null;
  marketCap: number | null;
  liquidity: number | null;
  volume24h: number | null;
  priceChange24h: number | null;
  txns24h: { buys: number; sells: number } | null;
  pairAge: number | null; // ms since pair creation
  imageUrl: string | null;
  websites: string[];
  socials: { type: string; url: string }[];
  dexUrl: string | null;
}

export async function getDexScreenerData(mint: string): Promise<DexScreenerData | null> {
  try {
    const url = `https://api.dexscreener.com/tokens/v1/solana/${mint}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const pairs = (await res.json()) as DexScreenerPair[];
    if (!pairs || !Array.isArray(pairs) || pairs.length === 0) return null;

    // Sort by liquidity to get the best/main pair
    const sorted = [...pairs].sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    const best = sorted[0];

    // Aggregate totals across all pairs
    const totalLiquidity = pairs.reduce((sum, p) => sum + (p.liquidity?.usd || 0), 0);
    const totalVolume24h = pairs.reduce((sum, p) => sum + (p.volume?.h24 || 0), 0);
    const totalBuys24h = pairs.reduce((sum, p) => sum + (p.txns?.h24?.buys || 0), 0);
    const totalSells24h = pairs.reduce((sum, p) => sum + (p.txns?.h24?.sells || 0), 0);

    // Collect socials from all pairs
    const websites: string[] = [];
    const socials: { type: string; url: string }[] = [];
    for (const p of pairs) {
      if (p.info?.websites) {
        for (const w of p.info.websites) {
          if (!websites.includes(w.url)) websites.push(w.url);
        }
      }
      if (p.info?.socials) {
        for (const s of p.info.socials) {
          if (!socials.find(x => x.url === s.url)) socials.push(s);
        }
      }
    }

    // Find oldest pair creation
    const oldestPairTime = Math.min(...pairs.map(p => p.pairCreatedAt || Date.now()));

    return {
      pairs: sorted.slice(0, 5), // keep top 5 pairs
      priceUsd: parseFloat(best.priceUsd) || null,
      marketCap: best.marketCap || best.fdv || null,
      liquidity: totalLiquidity || null,
      volume24h: totalVolume24h || null,
      priceChange24h: best.priceChange?.h24 ?? null,
      txns24h: { buys: totalBuys24h, sells: totalSells24h },
      pairAge: oldestPairTime ? Date.now() - oldestPairTime : null,
      imageUrl: best.info?.imageUrl || null,
      websites,
      socials,
      dexUrl: best.url || null,
    };
  } catch {
    return null;
  }
}

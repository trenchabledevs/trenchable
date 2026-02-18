import { RISK_WEIGHTS, type RiskCheckResult } from '@trenchable/shared';
import type { ScanContext } from '../types/risk.types.js';

// Fetch token metadata URI and analyze social links
async function getTokenMetadataUri(ctx: ScanContext): Promise<string | null> {
  try {
    const METADATA_PROGRAM = new (await import('@solana/web3.js')).PublicKey(
      'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
    );
    const [metadataPda] = (await import('@solana/web3.js')).PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), METADATA_PROGRAM.toBuffer(), ctx.tokenMint.toBuffer()],
      METADATA_PROGRAM
    );

    const accountInfo = await ctx.connection.getAccountInfo(metadataPda);
    if (!accountInfo) return null;

    const data = accountInfo.data;
    // Parse URI from metadata: skip name and symbol, then read uri
    let offset = 65 + 4; // key + updateAuth + mint + data key
    const nameLen = data.readUInt32LE(offset);
    offset += 4 + nameLen;
    const symbolLen = data.readUInt32LE(offset);
    offset += 4 + symbolLen;
    const uriLen = data.readUInt32LE(offset);
    offset += 4;
    const uri = data.subarray(offset, offset + uriLen).toString('utf-8').replace(/\0/g, '').trim();
    return uri || null;
  } catch {
    return null;
  }
}

async function fetchMetadataJson(uri: string): Promise<Record<string, unknown> | null> {
  try {
    // Handle IPFS URIs
    let fetchUrl = uri;
    if (uri.startsWith('ipfs://')) {
      fetchUrl = `https://ipfs.io/ipfs/${uri.slice(7)}`;
    }
    const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function checkSocialSentiment(ctx: ScanContext): Promise<RiskCheckResult> {
  try {
    const metadataUri = await getTokenMetadataUri(ctx);

    let hasWebsite = false;
    let hasTelegram = false;
    let hasTwitter = false;
    let description = '';

    if (metadataUri) {
      const json = await fetchMetadataJson(metadataUri);
      if (json) {
        // Check for social links in metadata JSON
        const external_url = json.external_url as string || '';
        description = (json.description as string) || '';

        // Check extensions/links fields common in pump.fun and metaplex metadata
        const extensions = json.extensions as Record<string, string> | undefined;
        const links = (json as any).links as Record<string, string> | undefined;

        hasWebsite = !!(external_url || extensions?.website || links?.website);
        hasTwitter = !!(extensions?.twitter || links?.twitter || (description && /twitter\.com|x\.com/i.test(description)));
        hasTelegram = !!(extensions?.telegram || links?.telegram || (description && /t\.me\//i.test(description)));
      }
    }

    // Score based on social presence
    const socialPoints = [hasWebsite, hasTwitter, hasTelegram].filter(Boolean).length;

    let score: number;
    let status: 'safe' | 'warning' | 'danger';
    let message: string;

    if (socialPoints >= 3) {
      score = 0;
      status = 'safe';
      message = 'Token has website, Twitter, and Telegram — good social presence';
    } else if (socialPoints >= 2) {
      score = 15;
      status = 'safe';
      message = `Token has ${socialPoints}/3 social links — decent presence`;
    } else if (socialPoints === 1) {
      score = 45;
      status = 'warning';
      message = 'Token has minimal social presence — only 1 link found';
    } else {
      score = 70;
      status = 'danger';
      message = 'No social links found — anonymous token with no web presence';
    }

    return {
      check: 'SOCIAL_SENTIMENT',
      status,
      score,
      weight: RISK_WEIGHTS.SOCIAL_SENTIMENT,
      details: {
        hasWebsite,
        hasTwitter,
        hasTelegram,
        metadataUri: metadataUri || null,
        socialLinks: socialPoints,
      },
      message,
    };
  } catch (error) {
    return {
      check: 'SOCIAL_SENTIMENT',
      status: 'unknown',
      score: 50,
      weight: RISK_WEIGHTS.SOCIAL_SENTIMENT,
      details: { error: String(error) },
      message: 'Could not analyze social sentiment',
    };
  }
}

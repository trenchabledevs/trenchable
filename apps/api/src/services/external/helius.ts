import { config } from '../../config/env.js';

export interface HeliusAsset {
  id: string;
  content: {
    json_uri: string;
    files: { uri: string; cdn_uri: string; mime: string }[];
    metadata: { name: string; symbol: string; description?: string };
    links: { image?: string; external_url?: string; [key: string]: unknown };
  };
  token_info?: {
    symbol: string;
    supply: number;
    decimals: number;
    token_program: string;
    price_info?: { price_per_token: number; currency: string };
    mint_authority?: string;
    freeze_authority?: string;
  };
  authorities: { address: string; scopes: string[] }[];
  mutable: boolean;
}

export async function getAsset(mint: string): Promise<HeliusAsset | null> {
  try {
    const rpcUrl = config.rpc.primary || config.rpc.fallback;
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'getAsset',
        params: { id: mint },
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const json = await res.json() as { result?: HeliusAsset };
    return json.result || null;
  } catch {
    return null;
  }
}

export function extractTokenImage(asset: HeliusAsset): string | null {
  // Priority: links.image > files[0].cdn_uri > files[0].uri
  if (asset.content?.links?.image) return asset.content.links.image;
  if (asset.content?.files?.length > 0) {
    return asset.content.files[0].cdn_uri || asset.content.files[0].uri || null;
  }
  return null;
}

export function extractTokenMeta(asset: HeliusAsset): {
  name: string | null;
  symbol: string | null;
  image: string | null;
  description: string | null;
  priceUsd: number | null;
} {
  const name = asset.content?.metadata?.name || null;
  const symbol = asset.content?.metadata?.symbol || asset.token_info?.symbol || null;
  const image = extractTokenImage(asset);
  const description = asset.content?.metadata?.description || null;
  const priceUsd = asset.token_info?.price_info?.price_per_token ?? null;
  return { name, symbol, image, description, priceUsd };
}

export interface GoPlusResult {
  token_name: string;
  token_symbol: string;
  total_supply: string;
  holder_count: string;
  is_honeypot: string;
  is_mintable: string;
  creator_address: string;
  creator_balance: string;
  creator_percent: string;
  owner_address: string;
  owner_balance: string;
  owner_percent: string;
  buy_tax: string;
  sell_tax: string;
  cannot_buy: string;
  cannot_sell_all: string;
  is_anti_whale: string;
  is_blacklisted: string;
  is_whitelisted: string;
  slippage_modifiable: string;
  transfer_pausable: string;
  owner_change_balance: string;
  hidden_owner: string;
  external_call: string;
  is_proxy: string;
  is_in_dex: string;
  is_true_token: string;
  is_airdrop_scam: string;
  trust_list: string;
  honeypot_with_same_creator: string;
  fake_token: { value: number; true_token_address: string } | null;
  holders: {
    address: string;
    balance: string;
    percent: string;
    is_locked: number;
    tag: string;
  }[];
  dex: {
    dex_name: string;
    tvl: string;
    price: string;
    type: string;
  }[];
  lp_holders: {
    address: string;
    balance: string;
    percent: string;
    is_locked: number;
    locked_detail: { amount: string; end_time: string; opt_time: string }[];
    tag: string;
  }[];
  metadata?: {
    name: string;
    symbol: string;
    description: string;
    uri: string;
  };
  mintable?: { authority: { address: string; malicious_address: number }[]; status: string };
  freezable?: { authority: { address: string; malicious_address: number }[]; status: string };
  trusted_token?: number;
}

export async function getGoPlusTokenSecurity(mint: string): Promise<GoPlusResult | null> {
  try {
    const url = `https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${mint}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;

    const json = await res.json() as { code: number; result: Record<string, GoPlusResult> };
    if (json.code !== 1) return null;

    return json.result[mint] || json.result[mint.toLowerCase()] || null;
  } catch {
    return null;
  }
}

export function extractGoPlusRiskFlags(data: GoPlusResult): string[] {
  const flags: string[] = [];

  if (data.is_honeypot === '1') flags.push('GoPlus: Honeypot detected');
  if (data.cannot_sell_all === '1') flags.push('GoPlus: Cannot sell all tokens');
  if (data.cannot_buy === '1') flags.push('GoPlus: Cannot buy token');
  if (data.is_airdrop_scam === '1') flags.push('GoPlus: Airdrop scam detected');
  if (data.is_blacklisted === '1') flags.push('GoPlus: Blacklist function exists');
  if (data.transfer_pausable === '1') flags.push('GoPlus: Transfers can be paused');
  if (data.owner_change_balance === '1') flags.push('GoPlus: Owner can change balances');
  if (data.hidden_owner === '1') flags.push('GoPlus: Hidden owner detected');
  if (data.slippage_modifiable === '1') flags.push('GoPlus: Tax rates can be changed');
  if (data.is_proxy === '1') flags.push('GoPlus: Proxy contract detected');
  if (data.external_call === '1') flags.push('GoPlus: External contract calls');
  if (data.fake_token && data.fake_token.value > 0) flags.push('GoPlus: Fake/counterfeit token');

  const buyTax = parseFloat(data.buy_tax || '0');
  const sellTax = parseFloat(data.sell_tax || '0');
  if (buyTax > 0.05) flags.push(`GoPlus: High buy tax (${(buyTax * 100).toFixed(1)}%)`);
  if (sellTax > 0.05) flags.push(`GoPlus: High sell tax (${(sellTax * 100).toFixed(1)}%)`);

  const creatorPct = parseFloat(data.creator_percent || '0');
  if (creatorPct > 0.1) flags.push(`GoPlus: Creator holds ${(creatorPct * 100).toFixed(1)}%`);

  const honeypotCount = parseInt(data.honeypot_with_same_creator || '0', 10);
  if (honeypotCount > 0) flags.push(`GoPlus: Creator has ${honeypotCount} other honeypot(s)`);

  return flags;
}

export function extractGoPlusTrustSignals(data: GoPlusResult): string[] {
  const signals: string[] = [];

  if (data.trusted_token === 1 || data.trust_list === '1') signals.push('Verified on GoPlus trust list');
  if (data.is_true_token === '1') signals.push('Authentic token (not counterfeit)');
  if (data.is_in_dex === '1') signals.push('Listed on major DEX');

  return signals;
}

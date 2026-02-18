import { PublicKey } from '@solana/web3.js';
import type { Mint } from '@solana/spl-token';
import type { Connection } from '@solana/web3.js';

export interface ScanContext {
  tokenMint: PublicKey;
  mintInfo?: Mint;
  connection: Connection;
}

export interface RiskCheckService {
  check(ctx: ScanContext): Promise<import('@trenchable/shared').RiskCheckResult>;
}

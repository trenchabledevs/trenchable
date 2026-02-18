import { PublicKey } from '@solana/web3.js';
import { RISK_WEIGHTS, PROGRAM_IDS, RUG_PATTERN_INDICATORS, type RiskCheckResult } from '@trenchable/shared';
import type { ScanContext } from '../types/risk.types.js';

// Token-2022 extension types
const EXTENSION_TYPE_TRANSFER_FEE = 1;

export async function checkTokenTax(ctx: ScanContext): Promise<RiskCheckResult> {
  try {
    // First check if the token is using Token-2022 program
    const accountInfo = await ctx.connection.getAccountInfo(ctx.tokenMint);
    if (!accountInfo) {
      return unknownResult('Could not fetch token account');
    }

    const isToken2022 = accountInfo.owner.toBase58() === PROGRAM_IDS.TOKEN_2022;

    if (!isToken2022) {
      // Standard SPL Token — no transfer fees possible
      return {
        check: 'TOKEN_TAX',
        status: 'safe',
        score: 0,
        weight: RISK_WEIGHTS.TOKEN_TAX,
        details: {
          tokenProgram: 'SPL Token',
          hasTransferFee: false,
          transferFeeBps: 0,
        },
        message: 'Standard SPL Token — no transfer fees',
      };
    }

    // Token-2022: parse the mint account data for extensions
    // Token-2022 mint layout: first 82 bytes are standard mint data
    // After that comes extensions
    const data = accountInfo.data;

    if (data.length <= 82) {
      return {
        check: 'TOKEN_TAX',
        status: 'safe',
        score: 5,
        weight: RISK_WEIGHTS.TOKEN_TAX,
        details: {
          tokenProgram: 'Token-2022',
          hasTransferFee: false,
          extensions: [],
        },
        message: 'Token-2022 with no extensions — no hidden fees',
      };
    }

    // Parse extensions
    // Extension TLV format after base mint data + padding:
    // - account_type (1 byte) at offset 82 = 1 (Mint)
    // - Then TLV entries: type (2 bytes LE) + length (2 bytes LE) + value
    const extensions: { type: number; name: string }[] = [];
    let hasTransferFee = false;
    let transferFeeBps = 0;
    let maxTransferFeeBps = 0;
    let feeAuthority: string | null = null;

    let offset = 83; // skip account_type byte after 82-byte mint
    while (offset + 4 <= data.length) {
      const extType = data.readUInt16LE(offset);
      const extLen = data.readUInt16LE(offset + 2);

      if (extLen === 0 && extType === 0) break; // End of extensions

      const extName = getExtensionName(extType);
      extensions.push({ type: extType, name: extName });

      if (extType === EXTENSION_TYPE_TRANSFER_FEE) {
        hasTransferFee = true;
        // TransferFeeConfig layout:
        // - transfer_fee_config_authority (32 bytes)
        // - withdraw_withheld_authority (32 bytes)
        // - withheld_amount (8 bytes)
        // - older_transfer_fee: epoch (8) + max_fee (8) + transfer_fee_basis_points (2)
        // - newer_transfer_fee: epoch (8) + max_fee (8) + transfer_fee_basis_points (2)
        if (extLen >= 98) {
          const extStart = offset + 4;
          feeAuthority = new PublicKey(data.subarray(extStart, extStart + 32)).toBase58();

          // Newer transfer fee (current)
          const newerOffset = extStart + 32 + 32 + 8 + 18; // skip to newer
          if (newerOffset + 18 <= offset + 4 + extLen) {
            transferFeeBps = data.readUInt16LE(newerOffset + 16);
            // max fee
            const maxFee = data.readBigUInt64LE(newerOffset + 8);
            maxTransferFeeBps = transferFeeBps;
          }
        }
      }

      offset += 4 + extLen;
    }

    // Scoring
    let score: number;
    let status: 'safe' | 'warning' | 'danger';
    let message: string;

    if (!hasTransferFee) {
      score = 5;
      status = 'safe';
      message = `Token-2022 with ${extensions.length} extension(s) but no transfer fee`;
    } else if (transferFeeBps >= RUG_PATTERN_INDICATORS.criticalTaxBps) {
      score = 95;
      status = 'danger';
      message = `Transfer fee is ${(transferFeeBps / 100).toFixed(1)}% — extremely high tax (likely rug)`;
    } else if (transferFeeBps >= RUG_PATTERN_INDICATORS.maxAcceptableTaxBps) {
      score = 75;
      status = 'danger';
      message = `Transfer fee is ${(transferFeeBps / 100).toFixed(1)}% — high tax on every transfer`;
    } else if (transferFeeBps > 100) {
      score = 45;
      status = 'warning';
      message = `Transfer fee is ${(transferFeeBps / 100).toFixed(1)}% — moderate tax`;
    } else if (transferFeeBps > 0) {
      score = 15;
      status = 'safe';
      message = `Transfer fee is ${(transferFeeBps / 100).toFixed(1)}% — low tax`;
    } else {
      score = 5;
      status = 'safe';
      message = 'Transfer fee extension present but fee is 0%';
    }

    return {
      check: 'TOKEN_TAX',
      status,
      score,
      weight: RISK_WEIGHTS.TOKEN_TAX,
      details: {
        tokenProgram: 'Token-2022',
        hasTransferFee,
        transferFeeBps,
        transferFeePct: transferFeeBps / 100,
        feeAuthority,
        extensions: extensions.map(e => e.name),
      },
      message,
    };
  } catch (error) {
    return unknownResult(String(error));
  }
}

function getExtensionName(type: number): string {
  const names: Record<number, string> = {
    0: 'Uninitialized',
    1: 'TransferFeeConfig',
    2: 'TransferFeeAmount',
    3: 'MintCloseAuthority',
    4: 'ConfidentialTransferMint',
    5: 'ConfidentialTransferAccount',
    6: 'DefaultAccountState',
    7: 'ImmutableOwner',
    8: 'MemoTransfer',
    9: 'NonTransferable',
    10: 'InterestBearingConfig',
    11: 'CpiGuard',
    12: 'PermanentDelegate',
    13: 'NonTransferableAccount',
    14: 'TransferHook',
    15: 'TransferHookAccount',
    16: 'MetadataPointer',
    17: 'TokenMetadata',
    18: 'GroupPointer',
    19: 'GroupMemberPointer',
  };
  return names[type] || `Unknown(${type})`;
}

function unknownResult(msg: string): RiskCheckResult {
  return {
    check: 'TOKEN_TAX',
    status: 'unknown',
    score: 50,
    weight: RISK_WEIGHTS.TOKEN_TAX,
    details: { error: msg },
    message: 'Could not check for token taxes',
  };
}

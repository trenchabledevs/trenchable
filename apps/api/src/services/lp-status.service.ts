import { PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import { PROGRAM_IDS, RISK_WEIGHTS, type RiskCheckResult } from '@trenchable/shared';
import type { ScanContext } from '../types/risk.types.js';

// Raydium V4 AMM pool layout offsets for LP mint
const RAYDIUM_LP_MINT_OFFSET = 432;

async function findRaydiumPool(ctx: ScanContext): Promise<{ lpMint: PublicKey; poolAddress: PublicKey } | null> {
  try {
    // Search for Raydium V4 pool accounts that reference this token mint
    const accounts = await ctx.connection.getProgramAccounts(
      new PublicKey(PROGRAM_IDS.RAYDIUM_V4_AMM),
      {
        filters: [
          { dataSize: 752 }, // Raydium V4 pool account size
          {
            memcmp: {
              offset: 400, // baseMint offset in Raydium V4 layout
              bytes: ctx.tokenMint.toBase58(),
            },
          },
        ],
      }
    );

    // Also check quoteMint position
    if (accounts.length === 0) {
      const quotAccounts = await ctx.connection.getProgramAccounts(
        new PublicKey(PROGRAM_IDS.RAYDIUM_V4_AMM),
        {
          filters: [
            { dataSize: 752 },
            {
              memcmp: {
                offset: 432 - 32, // quoteMint is 32 bytes before lpMint
                bytes: ctx.tokenMint.toBase58(),
              },
            },
          ],
        }
      );
      if (quotAccounts.length > 0) {
        const data = quotAccounts[0].account.data;
        const lpMint = new PublicKey(data.subarray(RAYDIUM_LP_MINT_OFFSET, RAYDIUM_LP_MINT_OFFSET + 32));
        return { lpMint, poolAddress: quotAccounts[0].pubkey };
      }
      return null;
    }

    const data = accounts[0].account.data;
    const lpMint = new PublicKey(data.subarray(RAYDIUM_LP_MINT_OFFSET, RAYDIUM_LP_MINT_OFFSET + 32));
    return { lpMint, poolAddress: accounts[0].pubkey };
  } catch {
    return null;
  }
}

async function checkPumpFunBondingCurve(ctx: ScanContext): Promise<{
  isOnBondingCurve: boolean;
  isComplete: boolean;
  creator: string | null;
} | null> {
  try {
    // Derive the pump.fun bonding curve PDA
    const [bondingCurve] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), ctx.tokenMint.toBuffer()],
      new PublicKey(PROGRAM_IDS.PUMP_FUN)
    );

    const accountInfo = await ctx.connection.getAccountInfo(bondingCurve);
    if (!accountInfo || accountInfo.data.length < 8 + 8 * 5 + 1 + 32) return null;

    const data = accountInfo.data;
    // Skip 8 byte discriminator
    // virtualTokenReserves: u64 (offset 8)
    // virtualSolReserves: u64 (offset 16)
    // realTokenReserves: u64 (offset 24)
    // realSolReserves: u64 (offset 32)
    // tokenTotalSupply: u64 (offset 40)
    // complete: bool (offset 48)
    const complete = data[48] === 1;
    // creator: Pubkey (offset 49)
    const creator = new PublicKey(data.subarray(49, 81)).toBase58();

    return { isOnBondingCurve: true, isComplete: complete, creator };
  } catch {
    return null;
  }
}

export async function checkLPStatus(ctx: ScanContext): Promise<RiskCheckResult> {
  try {
    // First check if this is a pump.fun token still on bonding curve
    const pumpFun = await checkPumpFunBondingCurve(ctx);
    if (pumpFun && !pumpFun.isComplete) {
      return {
        check: 'LP_STATUS',
        status: 'safe',
        score: 10,
        weight: RISK_WEIGHTS.LP_STATUS,
        details: {
          platform: 'pump.fun',
          isOnBondingCurve: true,
          isComplete: false,
          creator: pumpFun.creator,
        },
        message: 'Token is on pump.fun bonding curve — liquidity is managed by the protocol',
      };
    }

    // Check for Raydium pool
    const pool = await findRaydiumPool(ctx);
    if (pool) {
      const lpMintInfo = await getMint(ctx.connection, pool.lpMint);
      const lpSupply = Number(lpMintInfo.supply);

      // Check if LP supply is 0 or near 0 (burned)
      if (lpSupply === 0) {
        return {
          check: 'LP_STATUS',
          status: 'safe',
          score: 0,
          weight: RISK_WEIGHTS.LP_STATUS,
          details: {
            platform: 'raydium',
            lpMint: pool.lpMint.toBase58(),
            lpSupply: 0,
            isBurned: true,
            isLocked: false,
          },
          message: 'LP tokens are fully burned — liquidity cannot be removed',
        };
      }

      // Check largest LP token holders to see if most are sent to burn address
      const largestAccounts = await ctx.connection.getTokenLargestAccounts(pool.lpMint);
      const totalLPSupply = lpSupply;
      let burnedAmount = 0;

      for (const account of largestAccounts.value) {
        const ownerInfo = await ctx.connection.getAccountInfo(account.address);
        if (!ownerInfo) continue;
        // Check if the token account owner is a known burn address
        // The "dead" address pattern or the null address
        const amount = Number(account.amount);
        // Simple check: if the owner is the system program or a known burn address
        if (account.address.toBase58().startsWith('1111') || amount === 0) {
          burnedAmount += amount;
        }
      }

      const burnPercentage = totalLPSupply > 0 ? (burnedAmount / totalLPSupply) * 100 : 0;

      if (burnPercentage > 95) {
        return {
          check: 'LP_STATUS',
          status: 'safe',
          score: 5,
          weight: RISK_WEIGHTS.LP_STATUS,
          details: {
            platform: 'raydium',
            lpMint: pool.lpMint.toBase58(),
            burnPercentage,
            isBurned: true,
          },
          message: `${burnPercentage.toFixed(1)}% of LP tokens burned — liquidity is essentially locked`,
        };
      }

      return {
        check: 'LP_STATUS',
        status: 'danger',
        score: 90,
        weight: RISK_WEIGHTS.LP_STATUS,
        details: {
          platform: 'raydium',
          lpMint: pool.lpMint.toBase58(),
          lpSupply: totalLPSupply,
          burnPercentage,
          isBurned: false,
          isLocked: false,
        },
        message: 'LP tokens are NOT burned or locked — liquidity can be pulled (rug risk)',
      };
    }

    // If we got here from a graduated pump.fun token
    if (pumpFun && pumpFun.isComplete) {
      return {
        check: 'LP_STATUS',
        status: 'warning',
        score: 40,
        weight: RISK_WEIGHTS.LP_STATUS,
        details: {
          platform: 'pump.fun',
          isComplete: true,
          note: 'Graduated from bonding curve, pool lookup did not find Raydium pool',
        },
        message: 'Token graduated from pump.fun — could not verify LP status on Raydium',
      };
    }

    return {
      check: 'LP_STATUS',
      status: 'unknown',
      score: 50,
      weight: RISK_WEIGHTS.LP_STATUS,
      details: { note: 'No pool found on Raydium or pump.fun' },
      message: 'Could not find a liquidity pool for this token',
    };
  } catch (error) {
    return {
      check: 'LP_STATUS',
      status: 'unknown',
      score: 50,
      weight: RISK_WEIGHTS.LP_STATUS,
      details: { error: String(error) },
      message: 'Error checking LP status',
    };
  }
}

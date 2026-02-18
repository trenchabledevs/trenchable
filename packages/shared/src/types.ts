export type RiskCheckType =
  | 'MINT_AUTHORITY'
  | 'FREEZE_AUTHORITY'
  | 'LP_STATUS'
  | 'TOP_HOLDERS'
  | 'BUNDLE_DETECTION'
  | 'DEV_WALLET'
  | 'HONEYPOT'
  | 'WALLET_CLUSTER'
  | 'SOCIAL_SENTIMENT'
  | 'RUG_PATTERN'
  | 'TOKEN_TAX'
  | 'SNIPER_BOTS';

export type RiskStatus = 'safe' | 'warning' | 'danger' | 'unknown';
export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';
export type Platform = 'pump.fun' | 'raydium' | 'meteora' | 'unknown';

export interface RiskCheckResult {
  check: RiskCheckType;
  status: RiskStatus;
  score: number;      // 0-100 (0 = safe, 100 = max risk)
  weight: number;     // 0-1, how much this check matters
  details: Record<string, unknown>;
  message: string;    // Human-readable summary
}

export interface TokenMarketData {
  priceUsd: number | null;
  marketCap: number | null;
  liquidity: number | null;
  volume24h: number | null;
  priceChange24h: number | null;
  txns24h: { buys: number; sells: number } | null;
  pairAge: number | null;
  dexUrl: string | null;
}

export interface ExternalRiskData {
  goPlusFlags: string[];
  goPlusTrust: string[];
  rugcheckFlags: string[];
  rugcheckScore: number | null;
  rugcheckVerified: boolean | null;
  lpLockedPct: number | null;
  lpBurnedPct: number | null;
  insidersDetected: number | null;
}

export interface ScanResponse {
  tokenMint: string;
  tokenName: string | null;
  tokenSymbol: string | null;
  tokenImage: string | null;
  tokenDescription: string | null;
  overallScore: number;
  riskLevel: RiskLevel;
  checks: RiskCheckResult[];
  scanTimestamp: number;
  scanDurationMs: number;
  platform: Platform;
  market: TokenMarketData | null;
  externalRisk: ExternalRiskData | null;
  socials: { type: string; url: string }[];
  websites: string[];
}

export interface ScanRequest {
  tokenMint: string;
}

export interface NewPairEvent {
  type: 'new_pair';
  platform: Platform;
  tokenMint: string;
  tokenName: string | null;
  tokenSymbol: string | null;
  creator: string;
  initialLiquidity: number | null;
  timestamp: number;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  rpcConnected: boolean;
  rpcLatencyMs: number;
}

export interface HolderInfo {
  address: string;
  amount: number;
  percentage: number;
  isLP: boolean;
  isBurn: boolean;
}

// Scan history
export interface ScanHistoryEntry {
  id: number;
  tokenMint: string;
  tokenName: string | null;
  tokenSymbol: string | null;
  overallScore: number;
  riskLevel: RiskLevel;
  platform: Platform;
  scanTimestamp: number;
  checksJson: string; // JSON-stringified RiskCheckResult[]
}

// Watchlist
export interface WatchlistEntry {
  id: number;
  tokenMint: string;
  tokenName: string | null;
  tokenSymbol: string | null;
  latestScore: number;
  previousScore: number | null;
  riskLevel: RiskLevel;
  platform: Platform;
  addedAt: number;
  lastScannedAt: number;
  autoRescan: boolean;
}

// Wallet cluster
export interface WalletCluster {
  fundingSource: string;
  wallets: string[];
  totalPct: number;
}

// Social sentiment
export interface SocialSentimentData {
  twitterMentions: number;
  twitterSentiment: 'positive' | 'neutral' | 'negative' | 'unknown';
  hasWebsite: boolean;
  hasTelegram: boolean;
  hasTwitter: boolean;
  accountAgeDays: number | null;
}

// Comparison
export interface ComparisonData {
  scans: ScanResponse[];
}

// Scan mode
export type ScanMode = 'instant' | 'deep';

// MC Prediction
export interface BondingCurveData {
  progressPct: number;
  realSolReserves: number;
  remainingToGraduateSol: number;
  estimatedGraduationMC: number;
}

export interface MCPredictionSignals {
  liquidityRatio: number;
  liquidityScore: number;
  momentumScore: number;
  holderStage: 'A' | 'B' | 'C' | 'D';
  concentrationRisk: 'low' | 'medium' | 'high' | 'extreme';
  tokenAge: 'minutes' | 'hours' | 'days' | 'weeks';
}

export interface MCFairValue {
  low: number;
  mid: number;
  high: number;
  trend: 'accumulating' | 'trending' | 'consolidating' | 'mature' | 'dying';
}

export interface MCPrediction {
  currentMC: number | null;
  bondingCurve: BondingCurveData | null;
  signals: MCPredictionSignals;
  fairValue: MCFairValue;
  summary: string;
  confidence: 'low' | 'medium' | 'high';
}

// Extended scan response for instant/deep modes
export interface ExtendedScanResponse extends ScanResponse {
  scanMode: ScanMode;
  mcPrediction: MCPrediction | null;
}

import { NextResponse } from "next/server";
import {
  getDeadTokenByAddress,
  purgeDemoData,
  upsertDeadToken,
} from "@/lib/db";
import {
  getTokenOverview,
  getTokenSecurity,
  getTokenOHLCV,
  getTokenPrice,
} from "@/lib/birdeye";
import { classify, computeMetrics } from "@/lib/classifier";
import { getOneLiner } from "@/lib/oneliner";
import type {
  DeadToken,
  AutopsyResult,
  SecurityFlag,
} from "@/lib/types";

export const dynamic = "force-dynamic";

function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";

  if (!address || !isValidSolanaAddress(address)) {
    return NextResponse.json(
      { error: "Invalid Solana address" },
      { status: 400 }
    );
  }

  purgeDemoData();

  const apiKey = process.env.BIRDEYE_API_KEY;

  if (!apiKey) {
    const indexedToken = getDeadTokenByAddress(address);
    if (indexedToken) {
      return buildCachedAutopsy(indexedToken);
    }
    return NextResponse.json(
      { error: "Birdeye API key is required for live autopsies." },
      { status: 503 }
    );
  }

  try {
    const overview = await getTokenOverview(address);
    if (!overview) {
      const indexedToken = getDeadTokenByAddress(address);
      if (indexedToken) {
        return buildCachedAutopsy(indexedToken);
      }
      return NextResponse.json(
        {
          error:
            "This token is so dead we can't even find its records.",
        },
        { status: 404 }
      );
    }

    const security = await getTokenSecurity(address);

    const createdAt = overview.createdAt
      ? overview.createdAt
      : Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    const ohlcv = await getTokenOHLCV(
      address,
      createdAt,
      Math.floor(Date.now() / 1000),
      "1H"
    );

    const priceData = await getTokenPrice(address);

    const liquidity = safeNumber(overview.liquidity);
    const marketCap = safeNumber(overview.mc);
    const volume24h = safeNumber(overview.v24hUSD);
    const holders = safeNumber(overview.holder);
    const price = safeNumber(overview.price);
    const history24hPrice = safeNumber(overview.history24hPrice, price);
    const realMarketCap = safeNumber(overview.realMc, marketCap > 0 ? marketCap * 1.2 : 0);
    const createdAtSeconds = safeNumber(overview.createdAt);
    const lastTradeUnixTime = safeNumber(overview.lastTradeUnixTime);

    const metrics = computeMetrics({
      liquidity,
      mc: marketCap,
      v24hUSD: volume24h,
      holder: holders,
      price,
      history24hPrice,
      createdAt: createdAtSeconds
        ? createdAtSeconds * 1000
        : undefined,
      lastTradeUnixTime,
      peakMcap: realMarketCap,
    });

    const result = classify(metrics);

    const token: DeadToken = {
      address,
      symbol: safeText(overview.symbol, address.slice(0, 4).toUpperCase()),
      name: safeText(overview.name, "Unknown Solana Token"),
      verdict: result.verdict,
      cause: result.cause,
      oneLiner: getOneLiner(result.verdict),
      bornAt: createdAtSeconds
        ? createdAtSeconds * 1000
        : Date.now() - result.timeToDeathHours * 60 * 60 * 1000,
      diedAt:
        result.verdict === "STILL ALIVE" ? 0 : Date.now(),
      peakMcap: metrics.peakMcap,
      finalMcap: marketCap,
      liquidityRemovedPct: metrics.liquidityRemovedPct,
      holdersBagged: holders,
      priceDropPct: metrics.priceDropPct,
      timeToDeathHours: result.timeToDeathHours,
      brutalityScore: result.brutalityScore,
      logoUri: overview.logoURI,
    };

    if (result.verdict !== "STILL ALIVE") {
      upsertDeadToken(token);
    }

    const securityFlags = buildSecurityFlags(security);

    const autopsyResult: AutopsyResult = {
      token,
      priceHistory: ohlcv,
      securityFlags,
      topHoldersPct: safeNumber(security?.top10HolderPercent),
      currentPrice: safeNumber(priceData?.value, price),
      currentLiquidity: liquidity,
      peakLiquidity:
        metrics.liquidityRemovedPct >= 100
          ? liquidity
          : liquidity / (1 - metrics.liquidityRemovedPct / 100),
    };

    return NextResponse.json(autopsyResult);
  } catch {
    const indexedToken = getDeadTokenByAddress(address);
    if (indexedToken) {
      return buildCachedAutopsy(indexedToken);
    }
    return NextResponse.json(
      {
        error:
          "This token is so dead we can't even find its records.",
      },
      { status: 404 }
    );
  }
}

function buildCachedAutopsy(token: DeadToken): NextResponse {
  const result: AutopsyResult = {
    token,
    priceHistory: [],
    securityFlags: [
      {
        label: "Security Data",
        danger: true,
        detail: "Live security data unavailable — cached token record only",
      },
    ],
    topHoldersPct: 0,
    currentPrice: token.finalMcap / 1_000_000,
    currentLiquidity: token.finalMcap * 0.1,
    peakLiquidity: token.peakMcap * 0.3,
  };

  return NextResponse.json(result);
}

function buildSecurityFlags(
  security: {
    mintAuthority?: string;
    freezeAuthority?: string;
    mutableMetadata: boolean;
    top10HolderPercent: number;
    isHoneypot?: boolean;
    transferFeeEnable?: boolean;
    nonTransferable?: boolean;
    top10UserPercent?: number;
  } | null
): SecurityFlag[] {
  if (!security) {
    return [
      {
        label: "Security Data",
        danger: true,
        detail: "Unable to fetch security data",
      },
    ];
  }

  const flags: SecurityFlag[] = [];

  flags.push({
    label: "Mint Authority",
    danger: !!security.mintAuthority,
    detail: security.mintAuthority
      ? "Active — can mint unlimited tokens"
      : "Revoked",
  });

  flags.push({
    label: "Freeze Authority",
    danger: !!security.freezeAuthority,
    detail: security.freezeAuthority
      ? "Active — can freeze holder wallets"
      : "Revoked",
  });

  flags.push({
    label: "Mutable Metadata",
    danger: security.mutableMetadata,
    detail: security.mutableMetadata
      ? "Metadata can be changed by creator"
      : "Metadata is immutable",
  });

  flags.push({
    label: "Top 10 Holder Concentration",
    danger: security.top10HolderPercent > 50,
    detail: `Top 10 wallets hold ${security.top10HolderPercent.toFixed(1)}% of supply`,
  });

  flags.push({
    label: "Honeypot Detection",
    danger: !!security.isHoneypot,
    detail: security.isHoneypot
      ? "Suspicious sell restrictions detected"
      : "No restrictions detected",
  });

  if (security.transferFeeEnable) {
    flags.push({
      label: "Transfer Fee",
      danger: true,
      detail: "Token has transfer fees enabled",
    });
  }

  if (security.nonTransferable) {
    flags.push({
      label: "Non-Transferable",
      danger: true,
      detail: "Token cannot be transferred",
    });
  }

  return flags;
}

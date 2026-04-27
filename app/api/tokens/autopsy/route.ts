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
  OHLCVPoint,
  BirdeyeTokenOverview,
} from "@/lib/types";

export const dynamic = "force-dynamic";

function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function firstPositive(...values: unknown[]): number {
  for (const value of values) {
    const n = safeNumber(value, NaN);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function safeText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function holderConcentrationPercent(security: {
  top10HolderPercent?: number | null;
  top10HolderBalance?: number | null;
  totalSupply?: number | null;
} | null): number {
  if (!security) return 0;
  const balance = safeNumber(security.top10HolderBalance, NaN);
  const supply = safeNumber(security.totalSupply, NaN);
  if (Number.isFinite(balance) && Number.isFinite(supply) && supply > 0) {
    return (balance / supply) * 100;
  }
  return safeNumber(security.top10HolderPercent);
}

function buildOverviewPriceHistory(
  overview: BirdeyeTokenOverview,
  currentPrice: number
): OHLCVPoint[] {
  const now = Date.now();
  const points = [
    { offsetMs: 24 * 60 * 60 * 1000, price: overview.history24hPrice },
    { offsetMs: 12 * 60 * 60 * 1000, price: overview.history12hPrice },
    { offsetMs: 8 * 60 * 60 * 1000, price: overview.history8hPrice },
    { offsetMs: 6 * 60 * 60 * 1000, price: overview.history6hPrice },
    { offsetMs: 4 * 60 * 60 * 1000, price: overview.history4hPrice },
    { offsetMs: 2 * 60 * 60 * 1000, price: overview.history2hPrice },
    { offsetMs: 60 * 60 * 1000, price: overview.history1hPrice },
    { offsetMs: 30 * 60 * 1000, price: overview.history30mPrice },
    { offsetMs: 0, price: currentPrice },
  ];

  return points
    .map(({ offsetMs, price }) => {
      const close = safeNumber(price, NaN);
      return {
        timestamp: now - offsetMs,
        open: close,
        high: close,
        low: close,
        close,
        volume: 0,
      };
    })
    .filter((point) => Number.isFinite(point.close));
}

function currentMarketCap(overview: BirdeyeTokenOverview): number {
  const price = safeNumber(overview.price);
  const supply = safeNumber(overview.supply);
  return firstPositive(
    overview.mc,
    overview.realMc,
    overview.marketCap,
    overview.fdv,
    supply > 0 && price > 0 ? supply * price : 0,
    safeNumber(overview.liquidity) * 10
  );
}

function maxObservedPrice(
  overview: BirdeyeTokenOverview,
  priceHistory: OHLCVPoint[]
): number {
  const currentPrice = safeNumber(overview.price);
  const prices = [
    ...priceHistory.flatMap((point) => [point.high, point.close, point.open]),
    overview.history24hPrice,
    overview.history12hPrice,
    overview.history8hPrice,
    overview.history6hPrice,
    overview.history4hPrice,
    overview.history2hPrice,
    overview.history1hPrice,
    overview.history30mPrice,
    currentPrice,
  ]
    .map((value) => safeNumber(value, NaN))
    .filter((value) => Number.isFinite(value) && value > 0);
  return Math.max(currentPrice, ...prices);
}

function estimatePeakMarketCap(
  overview: BirdeyeTokenOverview,
  priceHistory: OHLCVPoint[]
): number {
  const currentPrice = safeNumber(overview.price);
  const liveMarketCap = currentMarketCap(overview);
  const peakPrice = maxObservedPrice(overview, priceHistory);
  const supply = safeNumber(overview.supply);
  const priceDerivedPeak = supply > 0 ? peakPrice * supply : 0;
  const currentScaledPeak =
    currentPrice > 0 && liveMarketCap > 0
      ? liveMarketCap * (peakPrice / currentPrice)
      : 0;

  return Math.max(
    liveMarketCap,
    safeNumber(overview.realMc),
    priceDerivedPeak,
    currentScaledPeak
  );
}

function classifyDegradedToken(
  current: ReturnType<typeof classify>,
  metrics: ReturnType<typeof computeMetrics>,
  market: {
    peakMcap: number;
    marketCap: number;
    volume24h: number;
    holders: number;
    liquidity: number;
    priceChange24hPercent: number;
  },
  indexedToken?: DeadToken
): ReturnType<typeof classify> {
  if (current.verdict !== "STILL ALIVE") return current;

  if (indexedToken && indexedToken.verdict !== "STILL ALIVE") {
    return {
      verdict: indexedToken.verdict,
      cause: indexedToken.cause,
      brutalityScore: indexedToken.brutalityScore,
      timeToDeathHours: indexedToken.timeToDeathHours,
    };
  }

  if (metrics.priceDropPct >= 90 && market.marketCap < 5_000) {
    return {
      verdict: "RUGGED",
      cause: "Real Birdeye data shows 90%+ drawdown and current market cap below $5k",
      brutalityScore: Math.min(100, Math.max(75, Math.round(metrics.priceDropPct))),
      timeToDeathHours: Math.max(1, Math.round(metrics.ageHours * 10) / 10),
    };
  }

  if (market.marketCap > 0 && market.marketCap < 10_000) {
    return {
      verdict: "FAILED LAUNCH",
      cause: "Real Birdeye data shows current market cap below $10k",
      brutalityScore: Math.max(30, Math.round(Math.max(metrics.priceDropPct, 60) / 2)),
      timeToDeathHours: Math.max(1, Math.round(metrics.ageHours * 10) / 10),
    };
  }

  if (
    (market.priceChange24hPercent <= -70 || metrics.priceDropPct >= 70) &&
    market.volume24h <= Math.max(1_000, market.marketCap * 0.05) &&
    market.liquidity <= Math.max(5_000, market.marketCap * 0.1)
  ) {
    return {
      verdict: "SLOW BLEED",
      cause: "Real Birdeye data shows severe drawdown with weak volume and thin liquidity",
      brutalityScore: Math.min(
        95,
        Math.max(
          50,
          Math.round(
            Math.max(metrics.priceDropPct, Math.abs(market.priceChange24hPercent))
          )
        )
      ),
      timeToDeathHours: Math.max(24, Math.round(metrics.ageHours * 10) / 10),
    };
  }

  if (market.marketCap >= 50_000 && market.holders >= 100 && market.volume24h <= 10) {
    return {
      verdict: "ABANDONED",
      cause: "Real Birdeye data shows meaningful holder count with near-zero 24h volume",
      brutalityScore: 60,
      timeToDeathHours: Math.max(24, Math.round(metrics.ageHours * 10) / 10),
    };
  }

  return current;
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
  const indexedToken = getDeadTokenByAddress(address);

  const apiKey = process.env.BIRDEYE_API_KEY;

  if (!apiKey) {
    if (indexedToken) {
      return buildCachedAutopsy(indexedToken);
    }
    return NextResponse.json(
      { error: "Birdeye API key is required for live autopsies." },
      { status: 503 }
    );
  }

  try {
    // Birdeye endpoint: /defi/token_overview
    const overview = await getTokenOverview(address);
    if (!overview) {
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

    // Birdeye endpoint: /defi/token_security
    const security = await getTokenSecurity(address);

    const nowSeconds = Math.floor(Date.now() / 1000);
    const createdAt = overview.createdAt
      ? Math.max(overview.createdAt, nowSeconds - 30 * 24 * 60 * 60)
      : nowSeconds - 7 * 24 * 60 * 60;
    // Birdeye endpoint: /defi/ohlcv
    let ohlcv = await getTokenOHLCV(
      address,
      createdAt,
      nowSeconds,
      "1H"
    );
    if (ohlcv.length === 0) {
      // Birdeye endpoint: /defi/ohlcv
      ohlcv = await getTokenOHLCV(
        address,
        nowSeconds - 24 * 60 * 60,
        nowSeconds,
        "30m"
      );
    }

    // Birdeye endpoint: /defi/price
    const priceData = await getTokenPrice(address);

    const liquidity = safeNumber(overview.liquidity);
    const marketCap = currentMarketCap(overview);
    const volume24h = safeNumber(overview.v24hUSD);
    const holders = safeNumber(overview.holder);
    const price = safeNumber(overview.price);
    const history24hPrice = safeNumber(overview.history24hPrice, price);
    const currentPrice = safeNumber(priceData?.value, price);
    const overviewHistory = buildOverviewPriceHistory(overview, currentPrice);
    const priceHistory = ohlcv.length > 0 ? ohlcv : overviewHistory;
    const peakMarketCap = estimatePeakMarketCap(overview, priceHistory);
    const createdAtSeconds = safeNumber(overview.createdAt);
    const lastTradeUnixTime = safeNumber(overview.lastTradeUnixTime);

    const metrics = computeMetrics({
      liquidity,
      mc: marketCap,
      v24hUSD: volume24h,
      holder: holders,
      price,
      history24hPrice: Math.max(history24hPrice, maxObservedPrice(overview, priceHistory)),
      createdAt: createdAtSeconds
        ? createdAtSeconds * 1000
        : undefined,
      lastTradeUnixTime,
      peakMcap: peakMarketCap,
    });

    const result = classifyDegradedToken(
      classify(metrics),
      metrics,
      {
        peakMcap: peakMarketCap,
        marketCap,
        volume24h,
        holders,
        liquidity,
        priceChange24hPercent: safeNumber(overview.priceChange24hPercent),
      },
      indexedToken
    );

    const token: DeadToken = {
      address,
      symbol: safeText(overview.symbol, address.slice(0, 4).toUpperCase()),
      name: safeText(overview.name, "Unknown Solana Token"),
      verdict: result.verdict,
      cause: result.cause,
      oneLiner:
        indexedToken?.verdict === result.verdict
          ? indexedToken.oneLiner
          : getOneLiner(result.verdict),
      bornAt:
        indexedToken?.verdict === result.verdict
          ? indexedToken.bornAt
          : createdAtSeconds
            ? createdAtSeconds * 1000
            : Date.now() - result.timeToDeathHours * 60 * 60 * 1000,
      diedAt:
        result.verdict === "STILL ALIVE" ? 0 : indexedToken?.diedAt || Date.now(),
      peakMcap: Math.max(metrics.peakMcap, indexedToken?.peakMcap ?? 0),
      finalMcap: marketCap,
      liquidityRemovedPct: metrics.liquidityRemovedPct,
      holdersBagged: holders,
      priceDropPct: Math.max(metrics.priceDropPct, indexedToken?.priceDropPct ?? 0),
      timeToDeathHours: result.timeToDeathHours,
      brutalityScore: result.brutalityScore,
      logoUri: overview.logoURI,
    };

    if (result.verdict !== "STILL ALIVE") {
      upsertDeadToken(token);
    }

    const securityFlags = buildSecurityFlags(security, overview);

    const autopsyResult: AutopsyResult = {
      token,
      priceHistory,
      securityFlags,
      topHoldersPct: holderConcentrationPercent(security),
      currentPrice,
      currentLiquidity: liquidity,
      peakLiquidity:
        metrics.liquidityRemovedPct >= 100
          ? liquidity
          : liquidity / (1 - metrics.liquidityRemovedPct / 100),
    };

    return NextResponse.json(autopsyResult);
  } catch {
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
    currentPrice: 0,
    currentLiquidity: 0,
    peakLiquidity: 0,
  };

  return NextResponse.json(result);
}

function buildSecurityFlags(
  security: {
    ownerAddress?: string | null;
    creatorAddress?: string | null;
    metaplexUpdateAuthority?: string | null;
    mintAuthority?: string | null;
    freezeAuthority?: string | null;
    freezeable?: boolean | null;
    mutableMetadata: boolean | null;
    top10HolderPercent: number | null;
    top10HolderBalance?: number | null;
    totalSupply?: number | null;
    isHoneypot?: boolean;
    transferFeeEnable?: boolean;
    nonTransferable?: boolean;
    top10UserPercent?: number;
    lockInfo?: unknown;
  } | null,
  overview?: BirdeyeTokenOverview
): SecurityFlag[] {
  if (!security) {
    return [
      {
        label: "Security Data",
        danger: true,
        detail: overview
          ? "Birdeye token_security unavailable; showing live overview data only"
          : "Unable to fetch security data",
      },
      ...(overview
        ? [
            {
              label: "Live Liquidity",
              danger: safeNumber(overview.liquidity) <= 0,
              detail: `$${Math.round(safeNumber(overview.liquidity)).toLocaleString("en-US")} reported by token_overview`,
            },
            {
              label: "Holder Count",
              danger: safeNumber(overview.holder) < 50,
              detail: `${Math.round(safeNumber(overview.holder)).toLocaleString("en-US")} holders reported by token_overview`,
            },
          ]
        : []),
    ];
  }

  const flags: SecurityFlag[] = [];
  const mintAuthority = security.mintAuthority;
  const top10HolderPercent = holderConcentrationPercent(security);

  flags.push({
    label: "Mint Authority",
    danger: !!mintAuthority,
    detail: mintAuthority
      ? "Active — can mint unlimited tokens"
      : "Revoked",
  });

  flags.push({
    label: "Freeze Authority",
    danger: !!security.freezeAuthority || security.freezeable === true,
    detail: security.freezeAuthority || security.freezeable === true
      ? "Active — can freeze holder wallets"
      : "Revoked",
  });

  flags.push({
    label: "Mutable Metadata",
    danger: security.mutableMetadata === true,
    detail: security.mutableMetadata
      ? "Metadata can be changed by creator"
      : "Metadata is immutable",
  });

  flags.push({
    label: "Top 10 Holder Concentration",
    danger: top10HolderPercent > 50,
    detail: top10HolderPercent > 0
      ? `Top 10 wallets hold ${top10HolderPercent.toFixed(1)}% of supply`
      : "Birdeye did not return holder concentration for this token",
  });

  flags.push({
    label: "Honeypot Detection",
    danger: !!security.isHoneypot,
    detail: security.isHoneypot
      ? "Suspicious sell restrictions detected"
      : "No restrictions detected",
  });

  flags.push({
    label: "Liquidity Lock",
    danger: !security.lockInfo,
    detail: security.lockInfo
      ? "Liquidity lock info returned by Birdeye"
      : "No liquidity lock info returned by Birdeye",
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

import { NextResponse } from "next/server";
import {
  getDeadTokens,
  purgeDemoData,
  upsertDeadToken,
} from "@/lib/db";
import {
  getNewListings,
  getTrendingTokens,
  getTokenOverview,
} from "@/lib/birdeye";
import { classify, computeMetrics } from "@/lib/classifier";
import { getOneLiner } from "@/lib/oneliner";
import type { BirdeyeTokenOverview, DeadToken } from "@/lib/types";

export const dynamic = "force-dynamic";

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function currentMarketCap(overview: BirdeyeTokenOverview): number {
  const price = safeNumber(overview.price);
  const supply = safeNumber(overview.supply);
  return safeNumber(
    overview.mc,
    safeNumber(overview.realMc, supply > 0 && price > 0 ? supply * price : safeNumber(overview.liquidity) * 10)
  );
}

function maxOverviewPrice(overview: BirdeyeTokenOverview): number {
  const currentPrice = safeNumber(overview.price);
  const prices = [
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

function estimatePeakMarketCap(overview: BirdeyeTokenOverview): number {
  const currentPrice = safeNumber(overview.price);
  const liveMarketCap = currentMarketCap(overview);
  const maxObservedPrice = maxOverviewPrice(overview);
  const supply = safeNumber(overview.supply);
  const priceDerivedPeak = supply > 0 ? maxObservedPrice * supply : 0;
  const currentScaledPeak =
    currentPrice > 0 && liveMarketCap > 0
      ? liveMarketCap * (maxObservedPrice / currentPrice)
      : 0;

  return Math.max(
    liveMarketCap,
    safeNumber(overview.realMc),
    priceDerivedPeak,
    currentScaledPeak
  );
}

function normalizeOverview(overview: BirdeyeTokenOverview) {
  const price = safeNumber(overview.price);
  const marketCap = currentMarketCap(overview);
  const history24hPrice = Math.max(safeNumber(overview.history24hPrice, price), maxOverviewPrice(overview));
  const peakMcap = estimatePeakMarketCap(overview);
  return {
    liquidity: safeNumber(overview.liquidity),
    marketCap,
    volume24h: safeNumber(overview.v24hUSD),
    holders: safeNumber(overview.holder),
    price,
    history24hPrice,
    priceChange24hPercent: safeNumber(overview.priceChange24hPercent),
    createdAtMs: overview.createdAt ? safeNumber(overview.createdAt) * 1000 : undefined,
    lastTradeUnixTime: safeNumber(overview.lastTradeUnixTime),
    peakMcap,
  };
}

function buildToken(
  address: string,
  overview: BirdeyeTokenOverview,
  fallback: { symbol: string; name: string; logoUri?: string }
): DeadToken | null {
  const normalized = normalizeOverview(overview);
  const metrics = computeMetrics({
    liquidity: normalized.liquidity,
    mc: normalized.marketCap,
    v24hUSD: normalized.volume24h,
    holder: normalized.holders,
    price: normalized.price,
    history24hPrice: normalized.history24hPrice,
    createdAt: normalized.createdAtMs,
    lastTradeUnixTime: normalized.lastTradeUnixTime,
    peakMcap: normalized.peakMcap,
  });

  let result = classify(metrics);
  if (result.verdict === "STILL ALIVE") {
    if (metrics.priceDropPct >= 90 && normalized.marketCap < 5_000) {
      result = {
        verdict: "RUGGED",
        cause: "Real Birdeye data shows 90%+ drawdown and current market cap below $5k",
        brutalityScore: Math.min(100, Math.max(75, Math.round(metrics.priceDropPct))),
        timeToDeathHours: Math.max(1, Math.round(metrics.ageHours * 10) / 10),
      };
    } else if (
      normalized.peakMcap > 0 &&
      normalized.peakMcap < 10_000 &&
      (normalized.volume24h < 100 || normalized.holders < 50)
    ) {
      result = {
        verdict: "FAILED LAUNCH",
        cause: "Real Birdeye data shows sub-$10k market cap with dried-up launch activity",
        brutalityScore: Math.max(25, Math.round(metrics.priceDropPct / 2)),
        timeToDeathHours: Math.max(1, Math.round(metrics.ageHours * 10) / 10),
      };
    } else if (
      (normalized.priceChange24hPercent <= -70 || metrics.priceDropPct >= 70) &&
      normalized.volume24h <= Math.max(1_000, normalized.marketCap * 0.05) &&
      normalized.liquidity <= Math.max(5_000, normalized.marketCap * 0.1)
    ) {
      result = {
        verdict: "SLOW BLEED",
        cause: "Real Birdeye data shows severe drawdown with weak volume and thin liquidity",
        brutalityScore: Math.min(
          95,
          Math.max(50, Math.round(Math.max(metrics.priceDropPct, Math.abs(normalized.priceChange24hPercent))))
        ),
        timeToDeathHours: Math.max(24, Math.round(metrics.ageHours * 10) / 10),
      };
    } else if (
      normalized.marketCap >= 50_000 &&
      normalized.holders >= 100 &&
      normalized.volume24h <= 10
    ) {
      result = {
        verdict: "ABANDONED",
        cause: "Real Birdeye data shows meaningful holder count with near-zero 24h volume",
        brutalityScore: 60,
        timeToDeathHours: Math.max(24, Math.round(metrics.ageHours * 10) / 10),
      };
    }
  }

  if (result.verdict === "STILL ALIVE") return null;

  return {
    address,
    symbol: safeText(overview.symbol, fallback.symbol),
    name: safeText(overview.name, fallback.name),
    verdict: result.verdict,
    cause: result.cause,
    oneLiner: getOneLiner(result.verdict),
    bornAt:
      normalized.createdAtMs ??
      Date.now() - result.timeToDeathHours * 60 * 60 * 1000,
    diedAt: Date.now(),
    peakMcap: normalized.peakMcap,
    finalMcap: normalized.marketCap,
    liquidityRemovedPct: metrics.liquidityRemovedPct,
    holdersBagged: normalized.holders,
    priceDropPct: Math.max(metrics.priceDropPct, Math.abs(Math.min(normalized.priceChange24hPercent, 0))),
    timeToDeathHours: result.timeToDeathHours,
    brutalityScore: result.brutalityScore,
    logoUri: overview.logoURI ?? fallback.logoUri,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") ?? "ALL DEAD";
  const sort = searchParams.get("sort") ?? "Most Recent";

  purgeDemoData();

  const apiKey = process.env.BIRDEYE_API_KEY;
  if (apiKey) {
    try {
      // Birdeye endpoint: /defi/v2/tokens/new_listing
      const newListings = await getNewListings(20);
      // Birdeye endpoint: /defi/token_trending
      const trending = await getTrendingTokens();

      const allAddresses = new Set<string>();
      const candidates = [
        ...newListings.map((t) => ({
          address: t.address,
          symbol: t.symbol,
          name: t.name,
          logoUri: t.logoURI,
        })),
        ...trending.map((t) => ({
          address: t.address,
          symbol: t.symbol,
          name: t.name,
          logoUri: t.logoURI,
        })),
      ].filter((t) => {
        if (allAddresses.has(t.address)) return false;
        allAddresses.add(t.address);
        return true;
      });

      const overviewResults = await Promise.allSettled(
        candidates.slice(0, 24).map(async (candidate) => {
          // Birdeye endpoint: /defi/token_overview
          const overview = await getTokenOverview(candidate.address);
          return { candidate, overview };
        })
      );

      for (const item of overviewResults) {
        try {
          if (item.status !== "fulfilled" || !item.value.overview) continue;
          const { candidate, overview } = item.value;
          const token = buildToken(candidate.address, overview, candidate);
          if (!token) continue;
          upsertDeadToken(token);
        } catch {
          continue;
        }
      }
    } catch {
      // Birdeye API unavailable, fall through to cached data
    }
  }

  const tokens = getDeadTokens(filter, sort, 50);

  if (!apiKey && tokens.length === 0) {
    return NextResponse.json({
      tokens: [],
      filter,
      sort,
      message: "Birdeye API key is required for live token discovery.",
    });
  }

  return NextResponse.json({ tokens, filter, sort });
}

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
import type { DeadToken } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") ?? "ALL DEAD";
  const sort = searchParams.get("sort") ?? "Most Recent";

  purgeDemoData();

  const apiKey = process.env.BIRDEYE_API_KEY;
  if (apiKey) {
    try {
      const newListings = await getNewListings(20);
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

      for (const candidate of candidates.slice(0, 10)) {
        try {
          const overview = await getTokenOverview(candidate.address);
          if (!overview) continue;

          const metrics = computeMetrics({
            liquidity: overview.liquidity,
            mc: overview.mc,
            v24hUSD: overview.v24hUSD,
            holder: overview.holder,
            price: overview.price,
            history24hPrice: overview.history24hPrice,
            createdAt: overview.createdAt
              ? overview.createdAt * 1000
              : undefined,
            lastTradeUnixTime: overview.lastTradeUnixTime,
            peakMcap: overview.realMc ?? overview.mc * 1.2,
          });

          const result = classify(metrics);
          if (result.verdict === "STILL ALIVE") continue;

          const token: DeadToken = {
            address: candidate.address,
            symbol: overview.symbol || candidate.symbol,
            name: overview.name || candidate.name,
            verdict: result.verdict,
            cause: result.cause,
            oneLiner: getOneLiner(result.verdict),
            bornAt: overview.createdAt
              ? overview.createdAt * 1000
              : Date.now() - result.timeToDeathHours * 60 * 60 * 1000,
            diedAt: Date.now(),
            peakMcap: metrics.peakMcap,
            finalMcap: overview.mc,
            liquidityRemovedPct: metrics.liquidityRemovedPct,
            holdersBagged: overview.holder,
            priceDropPct: metrics.priceDropPct,
            timeToDeathHours: result.timeToDeathHours,
            brutalityScore: result.brutalityScore,
            logoUri: overview.logoURI ?? candidate.logoUri,
          };

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

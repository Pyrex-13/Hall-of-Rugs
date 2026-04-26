import fs from "fs";
import os from "os";
import path from "path";
import { getCachedResponse, setCachedResponse } from "./db";
import type {
  BirdeyeTokenOverview,
  BirdeyeTokenSecurity,
  BirdeyeOHLCV,
  BirdeyeNewListing,
  BirdeyeTrending,
  OHLCVPoint,
} from "./types";

const BIRDEYE_BASE = "https://public-api.birdeye.so";
const LOG_FILES = [
  path.join(process.cwd(), "api_calls.log"),
  path.join(os.tmpdir(), "api_calls.log"),
];

function getApiKey(): string | undefined {
  return process.env.BIRDEYE_API_KEY;
}

function logApiCall(
  endpoint: string,
  tokenAddress: string,
  statusCode: number
): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${endpoint}] [${tokenAddress}] [${statusCode}]\n`;
  for (const logFile of LOG_FILES) {
    try {
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      fs.appendFileSync(logFile, line);
      return;
    } catch {
      continue;
    }
  }
}

async function birdeyeFetch<T>(
  endpoint: string,
  tokenAddress: string = "",
  params: Record<string, string> = {},
  cacheTtlMs: number = 5 * 60 * 1000
): Promise<{ data: T | null; status: number; fromCache: boolean }> {
  const paramStr = new URLSearchParams(params).toString();
  const cached = getCachedResponse(endpoint, tokenAddress, paramStr);
  if (cached && Date.now() - cached.fetched_at < cacheTtlMs) {
    const isSuccessful = cached.status_code >= 200 && cached.status_code < 300;
    return {
      data: isSuccessful ? (JSON.parse(cached.response_json) as T) : null,
      status: cached.status_code,
      fromCache: true,
    };
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return { data: null, status: 0, fromCache: false };
  }

  const url = new URL(`${BIRDEYE_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  let status = 0;
  try {
    const res = await fetch(url.toString(), {
      headers: {
        "X-API-KEY": apiKey,
        "x-chain": "solana",
      },
    });
    status = res.status;
    logApiCall(endpoint, tokenAddress, status);

    if (!res.ok) {
      setCachedResponse(endpoint, tokenAddress, paramStr, "null", status);
      return { data: null, status, fromCache: false };
    }

    const json = await res.json();
    const responseData = json.data ?? json;
    const responseStr = JSON.stringify(responseData);
    setCachedResponse(endpoint, tokenAddress, paramStr, responseStr, status);
    return { data: responseData as T, status, fromCache: false };
  } catch (err) {
    logApiCall(endpoint, tokenAddress, status || 500);
    return { data: null, status: status || 500, fromCache: false };
  }
}

// Birdeye endpoint: /defi/token_overview
export async function getTokenOverview(
  address: string
): Promise<BirdeyeTokenOverview | null> {
  const { data } = await birdeyeFetch<BirdeyeTokenOverview>(
    "/defi/token_overview",
    address,
    { address }
  );
  return data;
}

// Birdeye endpoint: /defi/token_security
export async function getTokenSecurity(
  address: string
): Promise<BirdeyeTokenSecurity | null> {
  const { data } = await birdeyeFetch<BirdeyeTokenSecurity>(
    "/defi/token_security",
    address,
    { address }
  );
  return data;
}

// Birdeye endpoint: /defi/ohlcv
export async function getTokenOHLCV(
  address: string,
  timeFrom?: number,
  timeTo?: number,
  resolution: string = "1H"
): Promise<OHLCVPoint[]> {
  const now = Math.floor(Date.now() / 1000);
  const from = timeFrom ?? now - 7 * 24 * 60 * 60;
  const to = timeTo ?? now;
  const { data } = await birdeyeFetch<BirdeyeOHLCV>(
    "/defi/ohlcv",
    address,
    {
      address,
      type: resolution,
      time_from: from.toString(),
      time_to: to.toString(),
    }
  );
  if (!data?.items) return [];
  return data.items
    .map((item) => ({
      timestamp: Number(item.unixTime) * 1000,
      open: Number(item.o),
      high: Number(item.h),
      low: Number(item.l),
      close: Number(item.c),
      volume: Number(item.v),
    }))
    .filter(
      (item) =>
        Number.isFinite(item.timestamp) &&
        Number.isFinite(item.open) &&
        Number.isFinite(item.high) &&
        Number.isFinite(item.low) &&
        Number.isFinite(item.close) &&
        Number.isFinite(item.volume)
    );
}

// Birdeye endpoint: /defi/price
export async function getTokenPrice(
  address: string
): Promise<{ value: number; updateUnixTime: number } | null> {
  const { data } = await birdeyeFetch<{
    value: number;
    updateUnixTime: number;
  }>("/defi/price", address, { address });
  return data;
}

// Birdeye endpoint: /defi/v2/tokens/new_listing
export async function getNewListings(
  limit: number = 50
): Promise<BirdeyeNewListing["items"]> {
  const { data } = await birdeyeFetch<BirdeyeNewListing>(
    "/defi/v2/tokens/new_listing",
    "",
    { limit: limit.toString() }
  );
  return data?.items ?? [];
}

// Birdeye endpoint: /defi/token_trending
export async function getTrendingTokens(): Promise<BirdeyeTrending["items"]> {
  const { data } = await birdeyeFetch<BirdeyeTrending>(
    "/defi/token_trending",
    "",
    { sort_by: "rank", sort_type: "asc", limit: "50" }
  );
  return data?.items ?? [];
}

// Birdeye endpoint: /v1/wallet/token_list
export async function getWalletTokens(
  walletAddress: string
): Promise<
  Array<{
    address: string;
    symbol: string;
    balance: number;
    valueUsd: number;
  }>
> {
  const { data } = await birdeyeFetch<{
    items: Array<{
      address: string;
      symbol: string;
      uiAmount: number;
      valueUsd: number;
    }>;
  }>("/v1/wallet/token_list", walletAddress, { wallet: walletAddress });
  if (!data?.items) return [];
  return data.items.map((i) => ({
    address: i.address,
    symbol: i.symbol,
    balance: i.uiAmount,
    valueUsd: i.valueUsd,
  }));
}

export function generateMockOHLCV(
  peakPrice: number,
  durationHours: number,
  verdict: string
): OHLCVPoint[] {
  const points: OHLCVPoint[] = [];
  const now = Date.now();
  const start = now - durationHours * 60 * 60 * 1000;
  const steps = Math.min(Math.max(Math.round(durationHours), 12), 168);
  const interval = (durationHours * 60 * 60 * 1000) / steps;

  for (let i = 0; i <= steps; i++) {
    const t = start + i * interval;
    const progress = i / steps;
    let price: number;

    if (verdict === "RUGGED") {
      if (progress < 0.6) {
        price = peakPrice * (0.1 + 0.9 * (progress / 0.6));
      } else if (progress < 0.7) {
        price = peakPrice;
      } else {
        const dropProgress = (progress - 0.7) / 0.3;
        price = peakPrice * Math.max(0.001, 1 - dropProgress * 0.999);
      }
    } else if (verdict === "FAILED LAUNCH") {
      price = peakPrice * Math.max(0.001, 1 - progress * 0.99);
    } else if (verdict === "SLOW BLEED") {
      price =
        peakPrice * Math.max(0.01, Math.exp(-3 * progress));
    } else {
      price = peakPrice * Math.max(0.01, 1 - progress * 0.95);
    }

    const noise = 1 + (Math.random() - 0.5) * 0.1;
    price *= noise;
    const high = price * (1 + Math.random() * 0.05);
    const low = price * (1 - Math.random() * 0.05);

    points.push({
      timestamp: t,
      open: price,
      high,
      low,
      close: price,
      volume: Math.random() * peakPrice * 100,
    });
  }
  return points;
}

"use client";

import { useState, useEffect } from "react";
import type { AutopsyResult } from "@/lib/types";
import PriceDeathChart from "./PriceDeathChart";

function formatDate(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "Unknown";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "Unknown";
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  if (hours < 24) return `${Math.round(hours)} hours`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} days`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? `1 week` : `${weeks} weeks`;
}

function formatMcap(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  if (n < 0.000001) return `$${n.toExponential(2)}`;
  if (n < 0.01) return `$${n.toFixed(8)}`;
  if (n < 1) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US");
}

function safeNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Full autopsy report for a single dead token including chart, security flags, and verdict */
export default function AutopsyReport({
  address,
}: {
  address: string;
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AutopsyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const minDelay = new Promise((r) => setTimeout(r, 800));
    const fetchData = fetch(
      `/api/tokens/autopsy?address=${encodeURIComponent(address)}`
    ).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ??
            "This token is so dead we can't even find its records."
        );
      }
      return res.json() as Promise<AutopsyResult>;
    });

    Promise.all([minDelay, fetchData])
      .then(([, result]) => {
        setData(result);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [address]);

  const handleShare = () => {
    if (!data) return;
    const t = data.token;
    const tweetText = `☠️ DEATH CERTIFICATE — $${t.symbol}\n\nVerdict: ${t.verdict}\nPeak MCap: ${formatMcap(t.peakMcap)}\nLiquidity Removed: ${t.liquidityRemovedPct}%\nHolders Bagged: ${formatNumber(t.holdersBagged)}\n\n"${t.oneLiner}"\n\nAutopsy by Hall of Rugs\n#BirdeyeAPI @birdeye_data`;
    navigator.clipboard.writeText(tweetText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <p className="font-mono text-accent text-2xl sm:text-4xl tracking-wider">
            PERFORMING AUTOPSY...
            <span className="animate-blink">|</span>
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="font-mono text-accent text-xl sm:text-2xl mb-4">
            ☠️ NOT FOUND
          </p>
          <p className="font-sans text-muted text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { token, currentPrice } = data;
  const priceHistory = Array.isArray(data.priceHistory) ? data.priceHistory : [];
  const securityFlags = Array.isArray(data.securityFlags) ? data.securityFlags : [];
  const topHoldersPct = safeNumber(data.topHoldersPct);
  const addressLabel = token.address
    ? `${token.address.slice(0, 8)}...${token.address.slice(-6)}`
    : "Unknown address";

  return (
    <div className="max-w-4xl mx-auto opacity-0 animate-fade-up">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-4xl sm:text-6xl lg:text-7xl text-white tracking-tight">
              {token.name}
            </h1>
            <span className="text-2xl sm:text-3xl">
              {token.verdict === "STILL ALIVE" ? "🟢" : "🔴"}
            </span>
          </div>
          <p className="font-mono text-muted text-sm mt-2">
            ${token.symbol || "UNKNOWN"} — {addressLabel}
          </p>
        </div>
        <span
          className={`font-mono text-sm tracking-wider ${
            token.verdict === "STILL ALIVE"
              ? "text-green-500"
              : "text-accent"
          }`}
        >
          {token.verdict}
        </span>
      </div>

      <div className="flatline-container mb-8">
        <div className="flatline-line" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mb-8">
        <div className="bg-surface border border-border rounded-[4px] p-4">
          <p className="font-mono text-[10px] text-muted tracking-wider mb-1">
            BORN
          </p>
          <p className="font-mono text-sm text-mono">
            {formatDate(token.bornAt)}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-[4px] p-4">
          <p className="font-mono text-[10px] text-muted tracking-wider mb-1">
            {token.verdict === "STILL ALIVE" ? "STATUS" : "DIED"}
          </p>
          <p className="font-mono text-sm text-mono">
            {token.verdict === "STILL ALIVE"
              ? "On Life Support"
              : formatDate(token.diedAt)}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-[4px] p-4">
          <p className="font-mono text-[10px] text-muted tracking-wider mb-1">
            SURVIVED
          </p>
          <p className="font-mono text-sm text-mono">
            {formatDuration(token.timeToDeathHours)}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-[4px] p-4">
          <p className="font-mono text-[10px] text-muted tracking-wider mb-1">
            BRUTALITY
          </p>
          <p className="font-mono text-sm text-accent">
            {safeNumber(token.brutalityScore)}/100
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6 mb-8">
        <div className="bg-surface border border-border rounded-[4px] p-4">
          <p className="font-mono text-[10px] text-muted tracking-wider mb-1">
            PEAK MCAP
          </p>
          <p className="font-mono text-lg text-white">
            {formatMcap(token.peakMcap)}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-[4px] p-4">
          <p className="font-mono text-[10px] text-muted tracking-wider mb-1">
            FINAL MCAP
          </p>
          <p className="font-mono text-lg text-accent">
            {formatMcap(token.finalMcap)}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-[4px] p-4">
          <p className="font-mono text-[10px] text-muted tracking-wider mb-1">
            CURRENT PRICE
          </p>
          <p className="font-mono text-lg text-mono">
            {formatPrice(currentPrice)}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-[4px] p-4">
          <p className="font-mono text-[10px] text-muted tracking-wider mb-1">
            LIQUIDITY REMOVED
          </p>
          <p className="font-mono text-lg text-accent">
            {safeNumber(token.liquidityRemovedPct)}%
          </p>
        </div>
        <div className="bg-surface border border-border rounded-[4px] p-4">
          <p className="font-mono text-[10px] text-muted tracking-wider mb-1">
            HOLDERS BAGGED
          </p>
          <p className="font-mono text-lg text-white">
            {formatNumber(token.holdersBagged)}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-[4px] p-4">
          <p className="font-mono text-[10px] text-muted tracking-wider mb-1">
            PRICE DROP
          </p>
          <p className="font-mono text-lg text-accent">
            {safeNumber(token.priceDropPct).toFixed(2)}%
          </p>
        </div>
      </div>

      {topHoldersPct > 0 && (
        <div className="bg-surface border border-border rounded-[4px] p-4 mb-8">
          <p className="font-mono text-[10px] text-muted tracking-wider mb-2">
            TOP HOLDER CONCENTRATION
          </p>
          <div className="w-full h-2 bg-border rounded-[2px] overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-500"
              style={{ width: `${Math.min(topHoldersPct, 100)}%` }}
            />
          </div>
          <p className="font-mono text-xs text-mono mt-1">
            Top 10 wallets hold {topHoldersPct.toFixed(1)}% of supply
          </p>
        </div>
      )}

      {priceHistory.length > 0 && (
        <div className="mb-8">
          <p className="font-mono text-[10px] text-muted tracking-wider mb-3">
            PRICE HISTORY — LAUNCH TO DEATH
          </p>
          <PriceDeathChart data={priceHistory} />
        </div>
      )}

      {securityFlags.length > 0 && (
        <div className="bg-surface border border-border rounded-[4px] p-5 mb-8">
          <p className="font-mono text-[10px] text-muted tracking-wider mb-3">
            SECURITY ANALYSIS
          </p>
          <div className="space-y-2">
            {securityFlags.map((flag, i) => (
              <div
                key={i}
                className="flex items-start gap-3 font-mono text-xs sm:text-sm"
              >
                <span
                  className={
                    flag.danger ? "text-accent" : "text-muted"
                  }
                >
                  {flag.danger ? "✗" : "✓"}
                </span>
                <div>
                  <span className="text-white">{flag.label}</span>
                  <span className="text-muted ml-2">
                    — {flag.detail}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-surface border border-border rounded-[4px] p-5 mb-8">
        <p className="font-mono text-[10px] text-muted tracking-wider mb-2">
          OFFICIAL VERDICT
        </p>
        <p className="font-serif text-2xl sm:text-3xl text-accent mb-2">
          {token.verdict}
        </p>
        <p className="font-sans text-sm text-mono italic">
          {token.oneLiner}
        </p>
        {token.verdict === "STILL ALIVE" && (
          <p className="font-mono text-xs text-accent mt-3">
            Patient is alive but on life support. Exit while you can.
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleShare}
          className="font-mono text-xs tracking-wider border border-accent text-accent bg-transparent px-4 py-2 rounded-[4px] transition-all duration-200 hover:bg-accent hover:text-black"
        >
          {copied ? "COPIED ✓" : "SHARE OBITUARY"}
        </button>
      </div>
    </div>
  );
}

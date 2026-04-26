"use client";

import { useState } from "react";
import type { DeadToken } from "@/lib/types";
import Link from "next/link";
import ShareObituaryModal from "./ShareObituaryModal";

function formatDate(ts: number): string {
  if (!ts) return "Unknown";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  if (hours < 24) return `${Math.round(hours)} hours`;
  if (hours < 48) return `1 day`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} days`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? `1 week` : `${weeks} weeks`;
}

function formatMcap(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "UNAVAILABLE";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function getVerdictColor(verdict: string): string {
  switch (verdict) {
    case "RUGGED":
      return "text-accent";
    case "FAILED LAUNCH":
      return "text-muted";
    case "ABANDONED":
      return "text-mono";
    case "SLOW BLEED":
      return "text-accent/70";
    default:
      return "text-muted";
  }
}

/** Death certificate card displaying a dead token's vital stats and cause of death */
export default function DeathCertificateCard({
  token,
  index = 0,
}: {
  token: DeadToken;
  index?: number;
}) {
  const [showShare, setShowShare] = useState(false);

  return (
    <>
      <div
        className="group bg-surface border border-border rounded-[4px] p-5 sm:p-6 relative overflow-hidden transition-shadow duration-200 hover:shadow-[0_0_20px_rgba(220,38,38,0.3)] opacity-0 animate-fade-up card-noise"
        style={{ animationDelay: `${index * 40}ms` }}
      >
        <Link href={`/autopsy/${token.address}`} className="block">
          <div className="flex items-start justify-between mb-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base sm:text-lg">{"\u2620\uFE0F"}</span>
                <span className="font-serif text-3xl sm:text-5xl lg:text-[48px] text-white leading-none tracking-tight truncate">
                  ${token.symbol}
                </span>
              </div>
              <p className="font-sans text-muted text-xs sm:text-sm truncate mt-1">
                {token.name}
              </p>
            </div>
            <span
              className={`font-mono text-[10px] sm:text-xs tracking-wider ${getVerdictColor(token.verdict)} shrink-0 ml-2`}
            >
              {token.verdict}
            </span>
          </div>

          <div className="border-t border-border my-3" />

          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-3">
            <div>
              <p className="font-mono text-[10px] text-muted tracking-wider mb-1">
                BORN
              </p>
              <p className="font-mono text-xs sm:text-sm text-mono">
                {formatDate(token.bornAt)}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] text-muted tracking-wider mb-1">
                DIED
              </p>
              <p className="font-mono text-xs sm:text-sm text-mono">
                {formatDate(token.diedAt)}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] text-muted tracking-wider mb-1">
                SURVIVED
              </p>
              <p className="font-mono text-xs sm:text-sm text-mono">
                {formatDuration(token.timeToDeathHours)}
              </p>
            </div>
          </div>

          <div className="border-t border-border my-3" />

          <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-3">
            <div>
              <p className="font-mono text-[10px] text-muted tracking-wider mb-1">
                PEAK MCAP
              </p>
              <p className="font-mono text-sm sm:text-base text-white">
                {formatMcap(token.peakMcap)}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] text-muted tracking-wider mb-1">
                LIQUIDITY REMOVED
              </p>
              <p className="font-mono text-sm sm:text-base text-accent">
                {token.liquidityRemovedPct}%
              </p>
            </div>
          </div>

          <div className="border-t border-border my-3" />

          <div className="mb-3">
            <p className="font-mono text-[10px] text-muted tracking-wider mb-1">
              CAUSE
            </p>
            <p className="font-sans text-xs sm:text-sm text-mono leading-relaxed italic">
              {token.oneLiner}
            </p>
          </div>

          <div className="border-t border-border my-3" />

          <p className="font-mono text-[10px] sm:text-xs text-muted">
            <span className="text-mono">
              {formatNumber(token.holdersBagged)}
            </span>{" "}
            holders left holding bags
          </p>
        </Link>

        <div className="mt-3 pt-3 border-t border-border">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowShare(true);
            }}
            className="font-mono text-[10px] tracking-wider border border-border text-muted px-2 py-1 rounded-[2px] transition-all duration-200 hover:border-accent hover:text-accent"
          >
            SHARE OBITUARY
          </button>
        </div>
      </div>

      {showShare && (
        <ShareObituaryModal
          token={token}
          onClose={() => setShowShare(false)}
        />
      )}
    </>
  );
}

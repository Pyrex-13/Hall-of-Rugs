"use client";

import { useState, useEffect } from "react";
import type { DeadToken } from "@/lib/types";
import Link from "next/link";
import ShareObituaryModal from "./ShareObituaryModal";

function formatMcap(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/** Leaderboard table of the most brutal rugs, sortable and shareable */
export default function HallOfShameTable() {
  const [tokens, setTokens] = useState<DeadToken[]>([]);
  const [shareToken, setShareToken] = useState<DeadToken | null>(null);

  useEffect(() => {
    fetch("/api/tokens/dead?sort=Most+Brutal&filter=ALL+DEAD")
      .then((r) => r.json())
      .then((data: { tokens: DeadToken[] }) => setTokens(data.tokens))
      .catch(() => {});
  }, []);



  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="font-mono text-[10px] text-muted tracking-wider text-left py-3 px-3">
              #
            </th>
            <th className="font-mono text-[10px] text-muted tracking-wider text-left py-3 px-3">
              TOKEN
            </th>
            <th className="font-mono text-[10px] text-muted tracking-wider text-right py-3 px-3">
              PEAK MCAP
            </th>
            <th className="font-mono text-[10px] text-muted tracking-wider text-right py-3 px-3">
              % LOST
            </th>
            <th className="font-mono text-[10px] text-muted tracking-wider text-right py-3 px-3 hidden sm:table-cell">
              HOLDERS BAGGED
            </th>
            <th className="font-mono text-[10px] text-muted tracking-wider text-right py-3 px-3 hidden sm:table-cell">
              TIME TO DEATH
            </th>
            <th className="font-mono text-[10px] text-muted tracking-wider text-left py-3 px-3 hidden md:table-cell">
              CAUSE
            </th>
            <th className="font-mono text-[10px] text-muted tracking-wider text-right py-3 px-3">
            </th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token, i) => (
            <tr
              key={token.address}
              className="border-b border-border transition-colors duration-150 hover:bg-[#111111] opacity-0 animate-fade-up"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <td className="font-mono text-xs text-muted py-3 px-3">
                {i + 1}
              </td>
              <td className="py-3 px-3">
                <Link
                  href={`/autopsy/${token.address}`}
                  className="group"
                >
                  <span className="font-mono text-sm text-white group-hover:text-accent transition-colors">
                    ${token.symbol}
                  </span>
                  <span className="font-sans text-xs text-muted ml-2 hidden sm:inline">
                    {token.name}
                  </span>
                </Link>
              </td>
              <td className="font-mono text-sm text-mono text-right py-3 px-3">
                {formatMcap(token.peakMcap)}
              </td>
              <td className="font-mono text-sm text-accent text-right py-3 px-3">
                {token.priceDropPct.toFixed(1)}%
              </td>
              <td className="font-mono text-sm text-mono text-right py-3 px-3 hidden sm:table-cell">
                {formatNumber(token.holdersBagged)}
              </td>
              <td className="font-mono text-sm text-mono text-right py-3 px-3 hidden sm:table-cell">
                {formatDuration(token.timeToDeathHours)}
              </td>
              <td className="font-mono text-xs text-accent text-left py-3 px-3 hidden md:table-cell max-w-[200px] truncate">
                {token.verdict}
              </td>
              <td className="py-3 px-3 text-right">
                <button
                  onClick={() => setShareToken(token)}
                  className="font-mono text-[10px] tracking-wider border border-border text-muted px-2 py-1 rounded-[2px] transition-all duration-200 hover:border-accent hover:text-accent whitespace-nowrap"
                >
                  SHARE OBITUARY
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {tokens.length === 0 && (
        <div className="text-center py-12">
          <p className="font-mono text-accent text-sm tracking-wider mb-2">
            NO BODIES FOUND YET
          </p>
          <p className="font-mono text-muted text-xs">
            Connect Birdeye API data to start indexing the graveyard.
          </p>
        </div>
      )}
      {shareToken && (
        <ShareObituaryModal
          token={shareToken}
          onClose={() => setShareToken(null)}
        />
      )}
    </div>
  );
}

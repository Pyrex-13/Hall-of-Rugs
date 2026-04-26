"use client";

import { useState, useEffect } from "react";
import type { DeadToken } from "@/lib/types";

function formatMcap(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "UNAVAILABLE";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

function tokenToMessage(token: DeadToken): string {
  const icon = token.verdict === "RUGGED" ? "\u2620\uFE0F" : "\u26A0\uFE0F";
  return `${icon} $${token.symbol} \u2014 ${token.verdict}. ${formatMcap(token.peakMcap)} peak. ${token.holdersBagged.toLocaleString()} holders.`;
}

export default function DeathTicker() {
  const [messages, setMessages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tokens/dead?sort=Most+Recent&filter=ALL+DEAD")
      .then((r) => r.json())
      .then((data: { tokens?: DeadToken[] }) => {
        const tokens = data.tokens ?? [];
        if (tokens.length > 0) {
          setMessages(tokens.slice(0, 12).map(tokenToMessage));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="w-full border-t border-accent/30 border-b border-b-accent/30 bg-dead-ticker overflow-hidden">
        <div className="py-2.5 text-center">
          <span className="font-mono text-xs text-white/80 tracking-wider">
            EXHUMING LIVE BIRDEYE RECORDS...
          </span>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="w-full border-t border-accent/30 border-b border-b-accent/30 bg-dead-ticker overflow-hidden">
        <div className="py-2.5 text-center">
          <span className="font-mono text-xs text-muted tracking-wider">
            NO BODIES FOUND YET — Connect Birdeye API data to start indexing the graveyard.
          </span>
        </div>
      </div>
    );
  }

  const items = [...messages, ...messages];

  return (
    <div className="w-full border-t border-accent/30 border-b border-b-accent/30 bg-dead-ticker overflow-hidden">
      <div className="flex animate-ticker whitespace-nowrap py-2.5">
        {items.map((msg, i) => (
          <span
            key={i}
            className="font-mono text-xs text-white/80 mx-8 inline-block shrink-0"
          >
            {msg}
          </span>
        ))}
      </div>
    </div>
  );
}

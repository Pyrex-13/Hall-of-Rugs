"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { DeadToken, DayStats, FilterType, SortType } from "@/lib/types";
import DeathCertificateCard from "@/components/DeathCertificateCard";
import BodyCountBar from "@/components/BodyCountBar";
import DeathTicker from "@/components/DeathTicker";

const POLL_INTERVAL_MS = parseInt(
  process.env.NEXT_PUBLIC_POLL_INTERVAL_MS ?? "120000",
  10
);

const FILTERS: FilterType[] = [
  "ALL DEAD",
  "RUGGED",
  "FAILED LAUNCH",
  "ABANDONED",
  "SLOW BLEED",
];

const SORTS: SortType[] = [
  "Most Recent",
  "Biggest MCap Lost",
  "Most Holders Bagged",
  "Most Brutal",
];

/** Homepage graveyard — live feed of recently dead tokens with filtering and stats */
export default function HomePage() {
  const router = useRouter();
  const [tokens, setTokens] = useState<DeadToken[]>([]);
  const [stats, setStats] = useState<DayStats | null>(null);
  const [filter, setFilter] = useState<FilterType>("ALL DEAD");
  const [sort, setSort] = useState<SortType>("Most Recent");
  const [searchAddress, setSearchAddress] = useState("");
  const [initialLoad, setInitialLoad] = useState(true);

  const fetchTokens = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        filter,
        sort,
      });
      const res = await fetch(`/api/tokens/dead?${params}`);
      const data = await res.json();
      setTokens(data.tokens ?? []);
    } catch {
      /* keep existing data */
    }
  }, [filter, sort]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats/today");
      const data = await res.json();
      setStats(data);
    } catch {
      /* keep existing data */
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      await Promise.all([fetchTokens(), fetchStats()]);
      setInitialLoad(false);
    };
    load();
    const interval = setInterval(() => {
      fetchTokens();
      fetchStats();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchTokens, fetchStats]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const addr = searchAddress.trim();
    if (addr) {
      router.push(`/autopsy/${encodeURIComponent(addr)}`);
    }
  };

  return (
    <div className="min-h-screen">
      <section className="relative flex flex-col items-center justify-center min-h-[60vh] px-4 hero-glow">
        <h1 className="font-serif text-6xl sm:text-8xl lg:text-[120px] text-white tracking-[0.04em] text-center leading-none mb-4">
          Hall of Rugs
        </h1>
        <p className="font-mono text-xs sm:text-sm text-muted tracking-wider text-center mb-8">
          SOLANA&apos;S TOKEN GRAVEYARD — POWERED BY BIRDEYE DATA API
        </p>

        <form
          onSubmit={handleSearch}
          className="w-full max-w-[680px] flex flex-col sm:flex-row gap-2"
        >
          <input
            type="text"
            value={searchAddress}
            onChange={(e) => setSearchAddress(e.target.value)}
            placeholder="Enter contract address. We'll check the pulse."
            className="flex-1 bg-bg border-2 border-accent text-white font-mono text-sm px-4 py-3 rounded-[4px] outline-none placeholder:text-muted focus:shadow-[0_0_30px_rgba(220,38,38,0.2)] transition-shadow duration-200"
          />
          <button
            type="submit"
            className="font-mono text-sm tracking-wider text-accent border border-accent bg-transparent px-6 py-3 rounded-[4px] transition-all duration-200 hover:bg-accent hover:text-black shrink-0"
          >
            AUTOPSY →
          </button>
        </form>
      </section>

      <DeathTicker />

      <BodyCountBar stats={stats} />

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 w-full sm:w-auto">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`font-mono text-[10px] sm:text-xs tracking-wider px-3 py-2 border-b-2 transition-all duration-150 whitespace-nowrap ${
                  filter === f
                    ? "border-accent text-white"
                    : "border-transparent text-muted hover:text-mono"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted tracking-wider">
              SORT:
            </span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortType)}
              className="bg-bg border border-border text-mono font-mono text-xs px-2 py-1 rounded-[4px] outline-none cursor-pointer"
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {initialLoad ? (
          <div className="text-center py-20">
            <p className="font-mono text-accent text-lg tracking-wider">
              EXHUMING RECORDS...
              <span className="animate-blink">|</span>
            </p>
          </div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-mono text-accent text-lg tracking-wider mb-2">
              NO BODIES FOUND YET
            </p>
            <p className="font-mono text-muted text-xs">
              Connect Birdeye API data to start indexing the graveyard.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {tokens.map((token, i) => (
              <DeathCertificateCard
                key={token.address}
                token={token}
                index={i}
              />
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-border py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-mono text-[10px] text-muted tracking-wider">
            HALL OF RUGS — SOLANA&apos;S TOKEN GRAVEYARD
          </p>
          <p className="font-mono text-[10px] text-muted tracking-wider">
            BUILT FOR BIRDEYE DATA BIP COMPETITION SPRINT 2 — APRIL 2026
          </p>
        </div>
      </footer>
    </div>
  );
}

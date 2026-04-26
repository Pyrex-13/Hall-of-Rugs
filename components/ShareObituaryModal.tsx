"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DeadToken } from "@/lib/types";

const CARD_W = 640;
const CARD_H = 480;
const PAD = 32;

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

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}

function buildTweetText(t: DeadToken): string {
  return [
    `\u2620\uFE0F DEATH CERTIFICATE \u2014 $${t.symbol}`,
    "",
    `Verdict: ${t.verdict}`,
    `Peak MCap: ${formatMcap(t.peakMcap)} \u2192 ${formatMcap(t.finalMcap)}`,
    `Lost: ${t.priceDropPct.toFixed(1)}%`,
    `Liquidity Removed: ${t.liquidityRemovedPct}%`,
    `Holders Bagged: ${formatNumber(t.holdersBagged)}`,
    `Time to Death: ${formatDuration(t.timeToDeathHours)}`,
    "",
    `\u201C${t.oneLiner}\u201D`,
    "",
    "via Hall of Rugs",
    "#BirdeyeAPI @birdeye_data",
  ].join("\n");
}

/** Renders the obituary card onto a canvas for image export */
function drawCard(canvas: HTMLCanvasElement, token: DeadToken): void {
  const dpr = 2;
  canvas.width = CARD_W * dpr;
  canvas.height = CARD_H * dpr;
  canvas.style.width = `${CARD_W}px`;
  canvas.style.height = `${CARD_H}px`;

  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  ctx.strokeStyle = "#dc2626";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, CARD_W - 2, CARD_H - 2);

  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1;
  ctx.strokeRect(8, 8, CARD_W - 16, CARD_H - 16);

  let y = PAD + 4;

  ctx.font = "11px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#525252";
  ctx.textBaseline = "top";
  ctx.fillText("\u2620\uFE0F  HALL OF RUGS \u2014 DEATH CERTIFICATE", PAD, y);
  y += 28;

  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(PAD, y, CARD_W - PAD * 2, 1);
  y += 16;

  ctx.font = "bold 42px 'Instrument Serif', serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(truncate(`$${token.symbol}`, 16), PAD, y);

  ctx.font = "bold 14px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#dc2626";
  const verdictW = ctx.measureText(token.verdict).width;
  ctx.fillText(token.verdict, CARD_W - PAD - verdictW, y + 24);
  y += 52;

  ctx.font = "13px 'DM Sans', sans-serif";
  ctx.fillStyle = "#a3a3a3";
  ctx.fillText(truncate(token.name, 50), PAD, y);
  y += 30;

  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(PAD, y, CARD_W - PAD * 2, 1);
  y += 20;

  const COL_W = (CARD_W - PAD * 2) / 3;
  const statLabels = ["PEAK MCAP", "FINAL MCAP", "% LOST"];
  const statValues = [
    formatMcap(token.peakMcap),
    formatMcap(token.finalMcap),
    `${token.priceDropPct.toFixed(1)}%`,
  ];
  const statColors = ["#ffffff", "#dc2626", "#dc2626"];

  ctx.font = "10px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#525252";
  for (let i = 0; i < 3; i++) {
    ctx.fillText(statLabels[i], PAD + i * COL_W, y);
  }
  y += 16;
  ctx.font = "bold 18px 'JetBrains Mono', monospace";
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = statColors[i];
    ctx.fillText(statValues[i], PAD + i * COL_W, y);
  }
  y += 30;

  const stat2Labels = ["LIQ REMOVED", "HOLDERS BAGGED", "TIME TO DEATH"];
  const stat2Values = [
    `${token.liquidityRemovedPct}%`,
    formatNumber(token.holdersBagged),
    formatDuration(token.timeToDeathHours),
  ];
  const stat2Colors = ["#dc2626", "#ffffff", "#a3a3a3"];

  ctx.font = "10px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#525252";
  for (let i = 0; i < 3; i++) {
    ctx.fillText(stat2Labels[i], PAD + i * COL_W, y);
  }
  y += 16;
  ctx.font = "bold 18px 'JetBrains Mono', monospace";
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = stat2Colors[i];
    ctx.fillText(stat2Values[i], PAD + i * COL_W, y);
  }
  y += 30;

  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(PAD, y, CARD_W - PAD * 2, 1);
  y += 16;

  ctx.font = "italic 13px 'DM Sans', sans-serif";
  ctx.fillStyle = "#a3a3a3";
  ctx.fillText(`\u201C${truncate(token.oneLiner, 70)}\u201D`, PAD, y);
  y += 26;

  const barW = CARD_W - PAD * 2;
  const barH = 8;
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(PAD, y, barW, barH);
  ctx.fillStyle = "#dc2626";
  ctx.fillRect(PAD, y, barW * Math.min(token.brutalityScore, 100) / 100, barH);

  ctx.font = "10px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#525252";
  ctx.fillText("BRUTALITY", PAD, y + barH + 10);
  ctx.fillStyle = "#dc2626";
  const scoreText = `${token.brutalityScore}/100`;
  const scoreW = ctx.measureText(scoreText).width;
  ctx.fillText(scoreText, CARD_W - PAD - scoreW, y + barH + 10);
  y += barH + 28;

  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(PAD, y, CARD_W - PAD * 2, 1);
  y += 14;

  ctx.font = "10px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#525252";
  ctx.fillText("HALL OF RUGS \u2014 SOLANA\u2019S TOKEN GRAVEYARD", PAD, y);
  const tagText = "#BirdeyeAPI @birdeye_data";
  const tagW = ctx.measureText(tagText).width;
  ctx.fillText(tagText, CARD_W - PAD - tagW, y);
}

/**
 * Modal overlay showing a branded rug PnL / obituary card with copy-tweet
 * and download-as-PNG actions.
 */
export default function ShareObituaryModal({
  token,
  onClose,
}: {
  token: DeadToken;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (canvasRef.current) drawCard(canvasRef.current, token);
  }, [token]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleCopyTweet = useCallback(() => {
    navigator.clipboard.writeText(buildTweetText(token)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [token]);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `hall-of-rugs-${token.symbol}.png`;
    a.click();
  }, [token.symbol]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-surface border border-border rounded-[4px] p-5 sm:p-6 max-w-[700px] w-full card-noise"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 font-mono text-muted text-sm hover:text-accent transition-colors"
          aria-label="Close"
        >
          &times;
        </button>

        <p className="font-mono text-[10px] text-muted tracking-wider mb-4">
          RUG PNL CARD &mdash; ${ token.symbol }
        </p>

        <div className="flex justify-center mb-5 overflow-x-auto">
          <canvas
            ref={canvasRef}
            style={{ width: CARD_W, height: CARD_H }}
            className="border border-border rounded-[4px] max-w-full h-auto"
          />
        </div>

        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={handleCopyTweet}
            className="font-mono text-xs tracking-wider border border-accent text-accent bg-transparent px-4 py-2 rounded-[4px] transition-all duration-200 hover:bg-accent hover:text-black"
          >
            {copied ? "COPIED \u2713" : "COPY TWEET"}
          </button>
          <button
            onClick={handleDownload}
            className="font-mono text-xs tracking-wider border border-border text-mono bg-transparent px-4 py-2 rounded-[4px] transition-all duration-200 hover:border-accent hover:text-accent"
          >
            DOWNLOAD CARD
          </button>
        </div>
      </div>
    </div>
  );
}

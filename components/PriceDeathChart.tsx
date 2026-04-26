"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { OHLCVPoint } from "@/lib/types";

interface ChartDataPoint {
  time: string;
  timestamp: number;
  price: number;
  volume: number;
}

function formatAxisTime(ts: number): string {
  if (!Number.isFinite(ts)) return "Unknown";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  if (n < 0.000001) return `$${n.toExponential(2)}`;
  if (n < 0.01) return `$${n.toFixed(8)}`;
  if (n < 1) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

/** Recharts area chart showing price history from launch to death with red styling */
export default function PriceDeathChart({
  data,
}: {
  data: OHLCVPoint[];
}) {
  const chartData: ChartDataPoint[] = data
    .map((p) => ({
      time: formatAxisTime(Number(p.timestamp)),
      timestamp: Number(p.timestamp),
      price: Number(p.close),
      volume: Number(p.volume),
    }))
    .filter(
      (p) =>
        Number.isFinite(p.timestamp) &&
        Number.isFinite(p.price) &&
        Number.isFinite(p.volume)
    );

  if (chartData.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-[4px] p-8 text-center">
        <p className="font-mono text-muted text-sm">
          No price data available
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-[4px] p-4">
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#dc2626" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#dc2626" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#525252", fontSize: 10, fontFamily: "var(--font-mono)" }}
            interval="preserveStartEnd"
            minTickGap={60}
          />
          <YAxis
            hide
            domain={["dataMin", "dataMax"]}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const d = payload[0].payload as ChartDataPoint;
              return (
                <div className="bg-bg border border-accent rounded-[4px] px-3 py-2 shadow-lg">
                  <p className="font-mono text-[10px] text-muted">
                    {new Date(d.timestamp).toLocaleString()}
                  </p>
                  <p className="font-mono text-sm text-white">
                    {formatPrice(d.price)}
                  </p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke="#dc2626"
            strokeWidth={1.5}
            fill="url(#priceGrad)"
            dot={false}
            activeDot={{
              r: 3,
              fill: "#dc2626",
              stroke: "#080808",
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

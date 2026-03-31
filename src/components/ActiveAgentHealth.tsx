"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type {
    PipelineTelemetry,
    FlightData,
    ItemSummary,
} from "@/types/pipeline";

// ---------------------------------------------------------------------------
// Pure helpers (exported for direct unit testing)
// ---------------------------------------------------------------------------

const INPUT_RATE = 0.015 / 1000; // $15.00 / 1M tokens
const OUTPUT_RATE = 0.075 / 1000; // $75.00 / 1M tokens
const CACHE_READ_RATE = 0.0015 / 1000; // $1.50 / 1M tokens
const CACHE_WRITE_RATE = 0.00375 / 1000; // $3.75 / 1M tokens

export function calculateTotalCost(flightData: FlightData): number {
    let total = 0;
    for (const step of flightData) {
        total +=
            step.inputTokens * INPUT_RATE +
            step.outputTokens * OUTPUT_RATE +
            step.cacheReadTokens * CACHE_READ_RATE +
            step.cacheWriteTokens * CACHE_WRITE_RATE;
    }
    return total;
}

export function getTotalToolCalls(item: ItemSummary): number {
    return Object.values(item.toolCounts).reduce((sum, n) => sum + n, 0);
}

export interface HealthStatus {
    color: string;
    barColor: string;
    badge: string | null;
}

export function getHealthStatus(
    totalToolCalls: number,
    softLimit = 30,
    hardLimit = 40,
): HealthStatus {
    if (totalToolCalls >= hardLimit) {
        return {
            color: "text-red-700",
            barColor: "bg-red-500",
            badge: "Hard Kill Initiated",
        };
    }
    if (totalToolCalls >= softLimit) {
        return {
            color: "text-orange-700",
            barColor: "bg-orange-400",
            badge: "Soft Interception Triggered",
        };
    }
    return {
        color: "text-green-700",
        barColor: "bg-green-500",
        badge: null,
    };
}

export function formatFreshness(lastModified: string | null | undefined): string {
    if (!lastModified) return "";
    const diff = Date.now() - new Date(lastModified).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 5) return "Updated just now";
    if (seconds < 60) return `Updated ${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Updated ${minutes}m ago`;
    return `Updated ${Math.floor(minutes / 60)}h ago`;
}

// ---------------------------------------------------------------------------
// SWR fetcher
// ---------------------------------------------------------------------------

const fetcher = (url: string) =>
    fetch(url).then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
    });

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ActiveAgentHealthProps {
    slug: string;
}

export default function ActiveAgentHealth({ slug }: ActiveAgentHealthProps) {
    const { data, isLoading } = useSWR<PipelineTelemetry>(
        slug ? `/api/pipeline/${encodeURIComponent(slug)}` : null,
        fetcher,
        { refreshInterval: 3000, keepPreviousData: true },
    );

    const flightData = useMemo(() => data?.flightData ?? [], [data]);
    const lastModified = data?.lastModified ?? null;

    const totalCost = useMemo(
        () => calculateTotalCost(flightData),
        [flightData],
    );

    // Active agents = flight data items with outcome "in-progress"
    const activeAgents = useMemo(
        () =>
            flightData
                .filter((f) => f.outcome === "in-progress")
                .map((flightItem) => {
                    const toolCalls = getTotalToolCalls(flightItem);
                    const health = getHealthStatus(toolCalls);
                    const barWidth = Math.min((toolCalls / 40) * 100, 100);
                    return { flightItem, toolCalls, health, barWidth };
                }),
        [flightData],
    );

    // Determine freshness / staleness
    const isActive = activeAgents.length > 0;
    const freshness = formatFreshness(lastModified);
    const isStale =
        isActive && lastModified
            ? new Date().getTime() - new Date(lastModified).getTime() > 30_000
            : false;

    if (isLoading) {
        return (
            <div className="px-6 py-4 text-sm text-zinc-500">
                Loading agent health…
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            {/* Total Spend + Freshness */}
            <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    Total Spend: ${totalCost.toFixed(2)}
                </span>
                {freshness && (
                    <span
                        className={`text-xs ${isStale ? "text-amber-500" : "text-zinc-500"}`}
                        data-testid="freshness-indicator"
                    >
                        {isStale ? "⏳ Waiting for heartbeat…" : freshness}
                    </span>
                )}
            </div>

            {/* Active Agent Frustration Meters */}
            {activeAgents.length > 0 ? (
                activeAgents.map(({ flightItem, toolCalls, health, barWidth }) => (
                    <div key={flightItem.key} className="flex flex-col gap-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                Active: {flightItem.label}
                            </span>
                            <span className={`font-mono text-xs ${health.color}`}>
                                {toolCalls} / 40 tool calls
                            </span>
                        </div>

                        {/* Progress Bar */}
                        <div
                            className="h-3 w-full rounded-full bg-zinc-200 dark:bg-zinc-700"
                            role="progressbar"
                            aria-valuenow={toolCalls}
                            aria-valuemin={0}
                            aria-valuemax={40}
                        >
                            <div
                                className={`h-3 rounded-full transition-all ${health.barColor}`}
                                style={{ width: `${barWidth}%` }}
                                data-testid="health-bar"
                            />
                        </div>

                        {/* Badge */}
                        {health.badge && (
                            <span
                                className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${health.badge === "Hard Kill Initiated"
                                    ? "bg-red-100 text-red-800"
                                    : "bg-orange-100 text-orange-800"
                                    }`}
                                data-testid="health-badge"
                            >
                                {health.badge}
                            </span>
                        )}
                    </div>
                ))
            ) : (
                <div className="text-sm text-zinc-500">
                    No active agent
                </div>
            )}
        </div>
    );
}

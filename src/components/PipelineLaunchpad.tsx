"use client";

import useSWR from "swr";
import type { PipelineSummary } from "@/types/pipeline";

const fetcher = (url: string) =>
    fetch(url).then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
    });

function formatRelativeTime(iso: string): string {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

const STATUS_STYLES: Record<
    PipelineSummary["overallStatus"],
    { dot: string; bg: string; text: string; label: string }
> = {
    active: {
        dot: "bg-blue-500 animate-pulse",
        bg: "border-blue-500/30 bg-blue-950/20",
        text: "text-blue-400",
        label: "Active",
    },
    completed: {
        dot: "bg-green-500",
        bg: "border-green-500/30 bg-green-950/20",
        text: "text-green-400",
        label: "Completed",
    },
    failed: {
        dot: "bg-red-500",
        bg: "border-red-500/30 bg-red-950/20",
        text: "text-red-400",
        label: "Failed",
    },
};

export default function PipelineLaunchpad() {
    const { data: pipelines, isLoading } = useSWR<PipelineSummary[]>(
        "/api/pipelines",
        fetcher,
        { refreshInterval: 5000, keepPreviousData: true },
    );

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <div className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="h-40 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/50"
                        />
                    ))}
                </div>
            </div>
        );
    }

    if (!pipelines || pipelines.length === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
                <svg
                    className="h-12 w-12 text-zinc-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162M3.75 17.25V9a2.25 2.25 0 0 1 2.25-2.25h12A2.25 2.25 0 0 1 20.25 9v8.25"
                    />
                </svg>
                <p className="text-sm">No pipelines found in <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs">in-progress/</code></p>
                <p className="text-xs text-zinc-600">
                    Start an orchestrator run to see pipelines appear here.
                </p>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col p-6">
            <div className="mb-6">
                <h2 className="text-lg font-semibold text-zinc-200">
                    Pipeline Launchpad
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                    {pipelines.length} pipeline{pipelines.length !== 1 ? "s" : ""} discovered
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pipelines.map((p) => {
                    const style = STATUS_STYLES[p.overallStatus];
                    return (
                        <a
                            key={p.slug}
                            href={`?pipeline=${encodeURIComponent(p.slug)}`}
                            className={`group flex flex-col gap-3 rounded-xl border p-5 transition-all hover:scale-[1.02] hover:shadow-lg ${style.bg}`}
                            data-testid="pipeline-card"
                        >
                            {/* Header: status + feature name */}
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <h3 className="truncate text-sm font-semibold text-zinc-100 group-hover:text-white">
                                        {p.feature}
                                    </h3>
                                    <p className="mt-0.5 truncate font-mono text-xs text-zinc-500">
                                        {p.slug}
                                    </p>
                                </div>
                                <span
                                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${style.text}`}
                                >
                                    <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                                    {style.label}
                                </span>
                            </div>

                            {/* Active step */}
                            {p.activeStep && (
                                <p className="text-xs text-zinc-400">
                                    <span className="font-medium text-zinc-300">Active:</span>{" "}
                                    {p.activeStep}
                                </p>
                            )}

                            {/* Footer: cost + timing */}
                            <div className="mt-auto flex items-center justify-between text-xs text-zinc-500">
                                <span className="font-mono">
                                    ${p.totalCost.toFixed(2)}
                                </span>
                                <span>
                                    {p.started
                                        ? formatRelativeTime(p.started)
                                        : "—"}
                                </span>
                            </div>

                            {/* CTA */}
                            <div className="text-xs font-medium text-zinc-400 group-hover:text-zinc-200">
                                Open Dashboard →
                            </div>
                        </a>
                    );
                })}
            </div>
        </div>
    );
}

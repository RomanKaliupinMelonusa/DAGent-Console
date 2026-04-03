"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import type {
    PipelineTelemetry,
    PipelineStateItem,
    FlightData,
    ItemSummary,
    ChangeManifest,
} from "@/types/pipeline";

// ---------------------------------------------------------------------------
// Timeline event model
// ---------------------------------------------------------------------------

export type TimelineEventKind = "intent" | "architecture" | "triage" | "step";

export interface TimelineEvent {
    kind: TimelineEventKind;
    timestamp: string;
    stepKey: string;
    title: string;
    body: string | null;
    faultDomain?: string;
    diagnosticTrace?: string;
    isStreaming?: boolean;
    /** Agent reasoning messages for expandable detail view */
    messages?: string[];
    /** Shell commands executed */
    shellSummary?: string[];
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for direct unit testing)
// ---------------------------------------------------------------------------

export function parseErrorMessage(raw: string): {
    isStructured: boolean;
    faultDomain?: string;
    diagnosticTrace?: string;
    raw: string;
} {
    try {
        const parsed = JSON.parse(raw);
        if (
            parsed &&
            typeof parsed === "object" &&
            typeof parsed.fault_domain === "string" &&
            typeof parsed.diagnostic_trace === "string"
        ) {
            return {
                isStructured: true,
                faultDomain: parsed.fault_domain,
                diagnosticTrace: parsed.diagnostic_trace,
                raw,
            };
        }
    } catch {
        // Not valid JSON — fall through to plain-string fallback
    }
    return { isStructured: false, raw };
}

function formatStepBody(step: ItemSummary): string {
    const parts: string[] = [];
    if (step.durationMs) parts.push(`${Math.round(step.durationMs / 1000)}s`);
    if (step.agent) parts.push(step.agent);
    const stats: string[] = [];
    const totalTools = Object.values(step.toolCounts || {}).reduce((a, b) => a + b, 0);
    if (totalTools) stats.push(`${totalTools} tools`);
    if (step.shellCommands?.length) stats.push(`${step.shellCommands.length} shell`);
    if (step.filesChanged?.length) stats.push(`${step.filesChanged.length} files changed`);
    const tokens = (step.inputTokens || 0) + (step.outputTokens || 0);
    if (tokens > 0) stats.push(`${Math.round(tokens / 1000)}k tokens`);
    if (stats.length) parts.push(stats.join(" · "));
    return parts.join(" — ");
}

// ---------------------------------------------------------------------------
// SUMMARY.md parser — extracts per-step sections as insights
// ---------------------------------------------------------------------------

export interface SummaryStepInfo {
    agent?: string;
    duration?: string;
    toolUsage?: string;
    agentSummary?: string;
    pipelineOps?: string[];
}

/**
 * Parse SUMMARY.md to extract per-step info.
 * Sections look like: `#### ✅ Label — \`step-key\``
 */
export function parseSummarySteps(markdown: string): Map<string, SummaryStepInfo> {
    const result = new Map<string, SummaryStepInfo>();
    // Split on ####-level headers
    const sections = markdown.split(/^####\s+/m);
    for (const section of sections) {
        // Extract step key from backtick-quoted key
        const keyMatch = section.match(/`([a-z0-9-]+)`/);
        if (!keyMatch) continue;
        const key = keyMatch[1];
        const info: SummaryStepInfo = {};

        // Agent
        const agentMatch = section.match(/\|\s*Agent\s*\|\s*(\S+)\s*\|/);
        if (agentMatch) info.agent = agentMatch[1];

        // Duration
        const durationMatch = section.match(/\|\s*Duration\s*\|\s*(.+?)\s*\|/);
        if (durationMatch) info.duration = durationMatch[1];

        // Tool usage
        const toolMatch = section.match(/\*\*Tool usage:\*\*\s*(.+)/);
        if (toolMatch) info.toolUsage = toolMatch[1].trim();

        // Agent summary
        const summaryMatch = section.match(/\*\*Agent summary:\*\*\s*\n>\s*(.+)/);
        if (summaryMatch) info.agentSummary = summaryMatch[1].trim();

        // What it did & why (for deterministic steps)
        const whatMatch = section.match(/\*\*What it did & why:\*\*\s*\n-\s*(.+)/);
        if (whatMatch && !info.agentSummary) info.agentSummary = whatMatch[1].trim();

        // Pipeline operations
        const opsMatches = [...section.matchAll(/\*\*Pipeline operations:\*\*\n((?:\s*-\s*`.+`\n?)+)/g)];
        if (opsMatches.length > 0) {
            info.pipelineOps = [];
            for (const m of opsMatches) {
                const ops = [...m[1].matchAll(/`([^`]+)`/g)].map(o => o[1]);
                info.pipelineOps.push(...ops);
            }
        }

        result.set(key, info);
    }
    return result;
}

export function buildTimelineEvents(
    flightData: FlightData,
    changes: ChangeManifest,
    stateItems?: PipelineStateItem[],
    summaryMarkdown?: string,
): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    const flightByKey = new Map(flightData.map((f) => [f.key, f]));
    const summarySteps = summaryMarkdown ? parseSummarySteps(summaryMarkdown) : new Map();

    // --- Step progress cards from flight data ---
    for (const step of flightData) {
        if (step.outcome === "completed") {
            events.push({
                kind: "step",
                timestamp: step.finishedAt,
                stepKey: step.key,
                title: `✅ ${step.label}`,
                body: formatStepBody(step),
                messages: step.messages?.length ? step.messages : undefined,
                shellSummary: step.shellCommands?.length
                    ? step.shellCommands.slice(0, 5).map(s => s.command)
                    : undefined,
            });
        } else if (step.outcome === "in-progress") {
            const inProgressParts: string[] = [];
            if (step.agent) inProgressParts.push(step.agent);
            const totalTools = Object.values(step.toolCounts || {}).reduce((a, b) => a + b, 0);
            if (totalTools) inProgressParts.push(`${totalTools} tools so far`);
            if (step.shellCommands?.length) inProgressParts.push(`${step.shellCommands.length} shell`);
            events.push({
                kind: "step",
                timestamp: step.startedAt,
                stepKey: step.key,
                title: `⏳ ${step.label}`,
                body: inProgressParts.join(" — ") || null,
                isStreaming: true,
                messages: step.messages?.length ? step.messages : undefined,
                shellSummary: step.shellCommands?.length
                    ? step.shellCommands.slice(-5).map(s => s.command)
                    : undefined,
            });
        }
    }

    // --- Done state items with no flight data (already rotated out) ---
    if (stateItems) {
        for (const item of stateItems) {
            if (item.status === "done" && !flightByKey.has(item.key)) {
                const summary = summarySteps.get(item.key);
                const bodyParts: string[] = [];
                if (summary?.duration) bodyParts.push(summary.duration);
                bodyParts.push(summary?.agent || item.agent || "");
                if (summary?.toolUsage) bodyParts.push(summary.toolUsage);
                events.push({
                    kind: "step",
                    timestamp: "",
                    stepKey: item.key,
                    title: `✅ ${item.label}`,
                    body: bodyParts.filter(Boolean).join(" — ") || null,
                    messages: summary?.agentSummary ? [summary.agentSummary] : undefined,
                    shellSummary: summary?.pipelineOps,
                });
            } else if (item.status === "failed" && !flightByKey.has(item.key)) {
                events.push({
                    kind: "triage",
                    timestamp: "",
                    stepKey: item.key,
                    title: `❌ ${item.label}`,
                    body: item.error,
                });
            }
        }
    }

    // --- Thought cards (intents) — keyed to startedAt ---
    for (const step of flightData) {
        for (const intent of step.intents) {
            events.push({
                kind: "intent",
                timestamp: step.startedAt,
                stepKey: step.key,
                title: `Intent: ${intent}`,
                body: null,
                isStreaming: step.outcome === "in-progress",
            });
        }
    }

    // --- Triage / error cards — keyed to finishedAt ---
    for (const step of flightData) {
        if ((step.outcome === "failed" || step.outcome === "error") && step.errorMessage) {
            const parsed = parseErrorMessage(step.errorMessage);
            if (parsed.isStructured) {
                events.push({
                    kind: "triage",
                    timestamp: step.finishedAt,
                    stepKey: step.key,
                    title: "Self-Healing Triggered",
                    body: null,
                    faultDomain: parsed.faultDomain,
                    diagnosticTrace: parsed.diagnosticTrace,
                });
            } else {
                events.push({
                    kind: "triage",
                    timestamp: step.finishedAt,
                    stepKey: step.key,
                    title: "Error",
                    body: parsed.raw,
                });
            }
        }
    }

    // --- Architecture cards (docNotes) — keyed to finishedAt via flight data ---
    for (const step of changes.stepsCompleted) {
        if (step.docNote) {
            const flight = flightByKey.get(step.key);
            events.push({
                kind: "architecture",
                timestamp: flight?.finishedAt ?? "",
                stepKey: step.key,
                title: "Architecture Updated",
                body: step.docNote,
            });
        }
    }

    // Sort ascending by timestamp
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return events;
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

interface DecisionTimelineProps {
    slug: string;
}

export default function DecisionTimeline({ slug }: DecisionTimelineProps) {
    const [viewMode, setViewMode] = useState<"timeline" | "thoughts">("timeline");
    const { data, isLoading } = useSWR<PipelineTelemetry>(
        slug ? `/api/pipeline/${encodeURIComponent(slug)}` : null,
        fetcher,
        { refreshInterval: 3000, keepPreviousData: true },
    );

    const events = useMemo(() => {
        if (!data) return [];
        return buildTimelineEvents(
            data.flightData,
            data.changes,
            data.state?.items,
            data.markdownFiles?.summary,
        );
    }, [data]);

    // Build a unified chain-of-thought stream across all steps
    const thoughtStream = useMemo(() => {
        if (!data) return [];
        const thoughts: { stepKey: string; label: string; agent: string; message: string; index: number; timestamp: string; isStreaming?: boolean }[] = [];
        for (const step of data.flightData) {
            if (step.messages?.length) {
                for (let i = 0; i < step.messages.length; i++) {
                    thoughts.push({
                        stepKey: step.key,
                        label: step.label,
                        agent: step.agent,
                        message: step.messages[i],
                        index: i,
                        timestamp: step.startedAt,
                        isStreaming: step.outcome === "in-progress",
                    });
                }
            }
        }
        return thoughts;
    }, [data]);

    const totalThoughts = thoughtStream.length;

    if (isLoading) {
        return (
            <div className="px-6 py-4 text-sm text-zinc-500">
                Loading decision timeline…
            </div>
        );
    }

    if (events.length === 0) {
        return (
            <div className="px-6 py-4 text-sm text-zinc-500">
                No timeline events yet.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3 px-6 py-4">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    {viewMode === "timeline" ? "Decision Timeline" : "Chain of Thought"}
                </h2>
                <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden text-xs">
                    <button
                        onClick={() => setViewMode("timeline")}
                        className={`px-2.5 py-1 transition-colors ${viewMode === "timeline" ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
                    >
                        Timeline
                    </button>
                    <button
                        onClick={() => setViewMode("thoughts")}
                        className={`px-2.5 py-1 transition-colors ${viewMode === "thoughts" ? "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
                    >
                        🧠 Thoughts{totalThoughts > 0 ? ` (${totalThoughts})` : ""}
                    </button>
                </div>
            </div>

            {viewMode === "timeline" ? (
                <ol className="flex flex-col gap-2">
                    {events.map((ev, idx) => (
                        <li key={`${ev.kind}-${ev.stepKey}-${idx}`}>
                            {ev.kind === "step" && <StepCard event={ev} />}
                            {ev.kind === "intent" && <IntentCard event={ev} />}
                            {ev.kind === "architecture" && <ArchitectureCard event={ev} />}
                            {ev.kind === "triage" && <TriageCard event={ev} />}
                        </li>
                    ))}
                </ol>
            ) : (
                <ThoughtStream thoughts={thoughtStream} />
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Card sub-components
// ---------------------------------------------------------------------------

function IntentCard({ event }: { event: TimelineEvent }) {
    return (
        <div
            className={`rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950 ${event.isStreaming ? "animate-pulse" : ""}`}
            data-testid="intent-card"
        >
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                💡 {event.title}
                {event.isStreaming && (
                    <span className="ml-2 text-xs text-blue-500">● live</span>
                )}
            </p>
            <p className="mt-0.5 text-xs text-blue-600 dark:text-blue-400">
                {event.stepKey}
            </p>
        </div>
    );
}

function ArchitectureCard({ event }: { event: TimelineEvent }) {
    return (
        <div
            className="rounded-lg border border-indigo-300 bg-indigo-100 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-950"
            data-testid="architecture-card"
        >
            <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">
                📐 {event.title}
            </p>
            {event.body && (
                <p className="mt-1 text-sm text-indigo-700 dark:text-indigo-300">
                    {event.body}
                </p>
            )}
            <p className="mt-0.5 text-xs text-indigo-500 dark:text-indigo-400">
                {event.stepKey}
            </p>
        </div>
    );
}

function TriageCard({ event }: { event: TimelineEvent }) {
    return (
        <div
            className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950"
            data-testid="triage-card"
        >
            <p className="text-sm font-bold text-red-800 dark:text-red-200">
                🚨 {event.title}
            </p>
            {event.faultDomain && (
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                    <span className="font-semibold">Fault Domain:</span>{" "}
                    {event.faultDomain}
                </p>
            )}
            {event.diagnosticTrace && (
                <p className="mt-0.5 text-sm text-red-700 dark:text-red-300">
                    <span className="font-semibold">Trace:</span>{" "}
                    {event.diagnosticTrace}
                </p>
            )}
            {event.body && (
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                    {event.body}
                </p>
            )}
            <p className="mt-0.5 text-xs text-red-500 dark:text-red-400">
                {event.stepKey}
            </p>
        </div>
    );
}

function StepCard({ event }: { event: TimelineEvent }) {
    const [expanded, setExpanded] = useState(false);
    const hasMessages = event.messages && event.messages.length > 0;
    const hasShell = event.shellSummary && event.shellSummary.length > 0;
    const hasDetails = hasMessages || hasShell;
    const msgCount = event.messages?.length ?? 0;

    // Show preview of the latest thought inline (truncated)
    const latestThought = hasMessages ? event.messages![event.messages!.length - 1] : null;
    const previewText = latestThought && latestThought.length > 160
        ? latestThought.slice(0, 160) + "…"
        : latestThought;

    return (
        <div
            className={`rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900 ${event.isStreaming ? "animate-pulse" : ""}`}
            data-testid="step-card"
        >
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {event.title}
                        {event.isStreaming && (
                            <span className="ml-2 text-xs text-emerald-500">● live</span>
                        )}
                    </p>
                    {event.body && (
                        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                            {event.body}
                        </p>
                    )}
                </div>
                {hasDetails && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 dark:text-violet-300 dark:bg-violet-950 dark:hover:bg-violet-900 transition-colors"
                        aria-label={expanded ? "Collapse details" : "Expand details"}
                    >
                        {expanded
                            ? "▲ Hide"
                            : msgCount > 0
                                ? `🧠 ${msgCount} thought${msgCount !== 1 ? "s" : ""}`
                                : "▼ Details"}
                    </button>
                )}
            </div>

            {/* Inline preview of latest thought (visible without expanding) */}
            {previewText && !expanded && (
                <p className="mt-2 text-xs italic text-zinc-500 dark:text-zinc-400 line-clamp-2 border-l-2 border-violet-300 dark:border-violet-700 pl-2">
                    &ldquo;{previewText}&rdquo;
                </p>
            )}

            {expanded && (
                <div className="mt-3 space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                    {hasMessages && (
                        <div>
                            <p className="mb-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400">
                                🧠 Chain of Thought
                            </p>
                            <ol className="space-y-1.5">
                                {event.messages!.map((msg, i) => (
                                    <li
                                        key={i}
                                        className="rounded bg-violet-50 px-3 py-2 text-xs leading-relaxed text-zinc-700 dark:bg-violet-950/50 dark:text-zinc-300 border-l-2 border-violet-300 dark:border-violet-700"
                                    >
                                        <span className="mr-1.5 font-mono text-violet-400 dark:text-violet-500">{i + 1}.</span>
                                        {msg}
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}
                    {hasShell && (
                        <div>
                            <p className="mb-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                                💻 Shell Commands
                            </p>
                            <ul className="space-y-1">
                                {event.shellSummary!.map((cmd, i) => (
                                    <li
                                        key={i}
                                        className="rounded bg-zinc-100 px-3 py-1.5 font-mono text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 break-all"
                                    >
                                        $ {cmd}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Thought Stream — unified chain-of-thought view across all steps
// ---------------------------------------------------------------------------

interface ThoughtItem {
    stepKey: string;
    label: string;
    agent: string;
    message: string;
    index: number;
    timestamp: string;
    isStreaming?: boolean;
}

function ThoughtStream({ thoughts }: { thoughts: ThoughtItem[] }) {
    if (thoughts.length === 0) {
        return (
            <div className="text-sm text-zinc-500 py-4">
                No agent thoughts available yet. Chain of thought data appears once steps have messages in the flight data.
            </div>
        );
    }

    // Group thoughts by step for readability
    const grouped = new Map<string, ThoughtItem[]>();
    for (const t of thoughts) {
        const arr = grouped.get(t.stepKey) ?? [];
        arr.push(t);
        grouped.set(t.stepKey, arr);
    }

    return (
        <div className="flex flex-col gap-4">
            {[...grouped.entries()].map(([stepKey, items]) => (
                <div key={stepKey}>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                            {items[0].isStreaming ? "⏳" : "✅"} {items[0].label}
                        </span>
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                            {items[0].agent} · {items.length} thought{items.length !== 1 ? "s" : ""}
                        </span>
                    </div>
                    <ol className="space-y-1.5 ml-1">
                        {items.map((t, i) => (
                            <li
                                key={i}
                                className={`rounded px-3 py-2 text-xs leading-relaxed border-l-2 ${t.isStreaming && i === items.length - 1
                                        ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-200 animate-pulse"
                                        : "border-violet-300 bg-violet-50 text-zinc-700 dark:border-violet-700 dark:bg-violet-950/30 dark:text-zinc-300"
                                    }`}
                            >
                                <span className="mr-1.5 font-mono text-violet-400 dark:text-violet-500">{t.index + 1}.</span>
                                {t.message}
                            </li>
                        ))}
                    </ol>
                </div>
            ))}
        </div>
    );
}

"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type {
    PipelineTelemetry,
    FlightData,
    ChangeManifest,
} from "@/types/pipeline";

// ---------------------------------------------------------------------------
// Timeline event model
// ---------------------------------------------------------------------------

export type TimelineEventKind = "intent" | "architecture" | "triage";

export interface TimelineEvent {
    kind: TimelineEventKind;
    timestamp: string;
    stepKey: string;
    title: string;
    body: string | null;
    faultDomain?: string;
    diagnosticTrace?: string;
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

export function buildTimelineEvents(
    flightData: FlightData,
    changes: ChangeManifest,
): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    // --- Thought cards (intents) — keyed to startedAt ---
    for (const step of flightData) {
        for (const intent of step.intents) {
            events.push({
                kind: "intent",
                timestamp: step.startedAt,
                stepKey: step.key,
                title: `Intent: ${intent}`,
                body: null,
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
    const flightByKey = new Map(flightData.map((f) => [f.key, f]));

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
    const { data, isLoading } = useSWR<PipelineTelemetry>(
        slug ? `/api/pipeline/${encodeURIComponent(slug)}` : null,
        fetcher,
        { refreshInterval: 3000 },
    );

    const events = useMemo(() => {
        if (!data) return [];
        return buildTimelineEvents(data.flightData, data.changes);
    }, [data]);

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
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Decision Timeline
            </h2>

            <ol className="flex flex-col gap-2">
                {events.map((ev, idx) => (
                    <li key={`${ev.kind}-${ev.stepKey}-${idx}`}>
                        {ev.kind === "intent" && <IntentCard event={ev} />}
                        {ev.kind === "architecture" && <ArchitectureCard event={ev} />}
                        {ev.kind === "triage" && <TriageCard event={ev} />}
                    </li>
                ))}
            </ol>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Card sub-components
// ---------------------------------------------------------------------------

function IntentCard({ event }: { event: TimelineEvent }) {
    return (
        <div
            className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950"
            data-testid="intent-card"
        >
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                💡 {event.title}
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

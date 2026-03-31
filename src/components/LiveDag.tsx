"use client";

import { useMemo } from "react";
import {
    ReactFlow,
    Background,
    Controls,
    type Node,
    type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import useSWR from "swr";
import type { PipelineTelemetry, PipelineStateItem } from "@/types/pipeline";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LiveDagProps {
    slug: string;
}

interface DagNodeDef {
    id: string;
    defaultLabel: string;
    position: { x: number; y: number };
}

// ---------------------------------------------------------------------------
// Static topology — 19 nodes, complete Two-Wave architecture + Finalize
// ---------------------------------------------------------------------------

// Wave 1 — Infra (sequential)
const INFRA_NODES: DagNodeDef[] = [
    { id: "schema-dev", defaultLabel: "Schema Dev", position: { x: 50, y: 0 } },
    { id: "infra-architect", defaultLabel: "Infra Architect", position: { x: 50, y: 100 } },
    { id: "push-infra", defaultLabel: "Push Infra", position: { x: 50, y: 200 } },
    { id: "create-draft-pr", defaultLabel: "Create Draft PR", position: { x: 50, y: 300 } },
    { id: "poll-infra-plan", defaultLabel: "Poll Infra Plan", position: { x: 50, y: 400 } },
    { id: "await-infra-approval", defaultLabel: "Await Infra Approval", position: { x: 50, y: 500 } },
    { id: "infra-handoff", defaultLabel: "Infra Handoff", position: { x: 50, y: 600 } },
];

// Wave 2 — App (parallel start gated by infra-handoff, then merge)
const APP_NODES: DagNodeDef[] = [
    { id: "backend-dev", defaultLabel: "Backend Dev", position: { x: 350, y: 700 } },
    { id: "frontend-dev", defaultLabel: "Frontend Dev", position: { x: 550, y: 700 } },
    { id: "backend-unit-test", defaultLabel: "Backend Unit Test", position: { x: 350, y: 800 } },
    { id: "frontend-unit-test", defaultLabel: "Frontend Unit Test", position: { x: 550, y: 800 } },
    { id: "push-app", defaultLabel: "Push App", position: { x: 450, y: 900 } },
    { id: "poll-app-ci", defaultLabel: "Poll App CI", position: { x: 450, y: 1000 } },
    { id: "integration-test", defaultLabel: "Integration Test", position: { x: 350, y: 1100 } },
    { id: "live-ui", defaultLabel: "Live UI", position: { x: 550, y: 1100 } },
];

// Finalize (sequential, converges from infra-handoff + live-ui)
const FINALIZE_NODES: DagNodeDef[] = [
    { id: "code-cleanup", defaultLabel: "Code Cleanup", position: { x: 300, y: 1250 } },
    { id: "docs-archived", defaultLabel: "Docs Archived", position: { x: 300, y: 1350 } },
    { id: "publish-pr", defaultLabel: "Publish PR", position: { x: 300, y: 1450 } },
];

const ALL_NODE_DEFS: DagNodeDef[] = [
    ...INFRA_NODES,
    ...APP_NODES,
    ...FINALIZE_NODES,
];

// ---------------------------------------------------------------------------
// Static edges — 18 nodes, 19 edges
// ---------------------------------------------------------------------------

const STATIC_EDGES: Edge[] = [
    // Infra wave (6 sequential)
    { id: "e-schema-dev->infra-architect", source: "schema-dev", target: "infra-architect" },
    { id: "e-infra-architect->push-infra", source: "infra-architect", target: "push-infra" },
    { id: "e-push-infra->create-draft-pr", source: "push-infra", target: "create-draft-pr" },
    { id: "e-create-draft-pr->poll-infra-plan", source: "create-draft-pr", target: "poll-infra-plan" },
    { id: "e-poll-infra-plan->await-infra-approval", source: "poll-infra-plan", target: "await-infra-approval" },
    { id: "e-await-infra-approval->infra-handoff", source: "await-infra-approval", target: "infra-handoff" },

    // Approval gate → Wave 2 (infra-handoff gates both app branches)
    { id: "e-infra-handoff->backend-dev", source: "infra-handoff", target: "backend-dev" },
    { id: "e-infra-handoff->frontend-dev", source: "infra-handoff", target: "frontend-dev" },

    // App wave — parallel branches merge into push-app
    { id: "e-backend-dev->backend-unit-test", source: "backend-dev", target: "backend-unit-test" },
    { id: "e-frontend-dev->frontend-unit-test", source: "frontend-dev", target: "frontend-unit-test" },
    { id: "e-backend-unit-test->push-app", source: "backend-unit-test", target: "push-app" },
    { id: "e-frontend-unit-test->push-app", source: "frontend-unit-test", target: "push-app" },
    { id: "e-push-app->poll-app-ci", source: "push-app", target: "poll-app-ci" },
    { id: "e-poll-app-ci->integration-test", source: "poll-app-ci", target: "integration-test" },
    { id: "e-poll-app-ci->live-ui", source: "poll-app-ci", target: "live-ui" },

    // Finalize — converges from both app-wave leaf nodes, then sequential
    { id: "e-integration-test->code-cleanup", source: "integration-test", target: "code-cleanup" },
    { id: "e-live-ui->code-cleanup", source: "live-ui", target: "code-cleanup" },
    { id: "e-code-cleanup->docs-archived", source: "code-cleanup", target: "docs-archived" },
    { id: "e-docs-archived->publish-pr", source: "docs-archived", target: "publish-pr" },
];

// ---------------------------------------------------------------------------
// Status → style mapping
// ---------------------------------------------------------------------------

interface StatusStyle {
    background: string;
    border: string;
    color: string;
    className?: string;
}

function getStatusStyle(status: PipelineStateItem["status"], error: string | null): StatusStyle {
    if (status === "done" && error) {
        return { background: "#fee2e2", border: "#ef4444", color: "#991b1b" };                   // Failed (red)
    }
    switch (status) {
        case "active":
            return { background: "#dbeafe", border: "#3b82f6", color: "#1e3a5f", className: "pulse-blue" }; // Pulsing blue
        case "done":
            return { background: "#dcfce7", border: "#22c55e", color: "#166534" };                // Green
        case "na":
            return { background: "#f3f4f6", border: "#9ca3af", color: "#9ca3af" };                // Dimmed gray
        case "pending":
        default:
            return { background: "#f3f4f6", border: "#9ca3af", color: "#374151" };                // Gray
    }
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

export default function LiveDag({ slug }: LiveDagProps) {
    const { data, isLoading } = useSWR<PipelineTelemetry>(
        slug ? `/api/pipeline/${encodeURIComponent(slug)}` : null,
        fetcher,
        { refreshInterval: 3000 },
    );

    // Build a lookup map: item.key → PipelineStateItem
    const itemMap = useMemo(() => {
        const map = new Map<string, PipelineStateItem>();
        if (data?.state?.items) {
            for (const item of data.state.items) {
                map.set(item.key, item);
            }
        }
        return map;
    }, [data]);

    // Map static node defs → React Flow nodes with live status styles
    const nodes: Node[] = useMemo(() => {
        return ALL_NODE_DEFS.map((def) => {
            const item = itemMap.get(def.id);
            const style = getStatusStyle(item?.status ?? "pending", item?.error ?? null);

            return {
                id: def.id,
                position: def.position,
                data: { label: item?.label || def.defaultLabel },
                style: {
                    background: style.background,
                    border: `2px solid ${style.border}`,
                    color: style.color,
                    borderRadius: 8,
                    padding: "10px 16px",
                    fontSize: 13,
                    fontWeight: 600,
                    minWidth: 150,
                    textAlign: "center" as const,
                },
                className: style.className,
            };
        });
    }, [itemMap]);

    // Check if the approval gate needs human action
    const approvalItem = itemMap.get("await-infra-approval");
    const approvalNeeded = approvalItem?.status === "active";

    return (
        <div className="flex flex-col h-full w-full">
            {/* Approval Gate Banner */}
            {approvalNeeded && (
                <div
                    role="alert"
                    className="flex items-center gap-3 bg-amber-100 border-b-2 border-amber-400 px-6 py-3 text-amber-900 font-semibold text-sm"
                >
                    <span className="text-xl">⚠️</span>
                    Human Action Required: Infrastructure Plan Awaiting Approval in GitHub.
                </div>
            )}

            {/* Loading overlay */}
            {isLoading && (
                <div className="flex items-center justify-center py-3 text-sm text-zinc-500">
                    Loading pipeline state…
                </div>
            )}

            {/* DAG Canvas */}
            <div className="flex-1 min-h-0">
                <ReactFlow
                    nodes={nodes}
                    edges={STATIC_EDGES}
                    fitView
                    proOptions={{ hideAttribution: true }}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}
                >
                    <Background />
                    <Controls showInteractive={false} />
                </ReactFlow>
            </div>
        </div>
    );
}

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
import type { PipelineTelemetry, PipelineStateItem, ItemSummary } from "@/types/pipeline";

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
// Static topology — matches the validated pipeline DAG contract
// ---------------------------------------------------------------------------

// Pre-deploy — schema first, then parallel dev + test, converge to cleanup
const PRE_DEPLOY_NODES: DagNodeDef[] = [
    { id: "schema-dev", defaultLabel: "Schema Dev", position: { x: 300, y: 0 } },
    { id: "backend-dev", defaultLabel: "Backend Dev", position: { x: 150, y: 100 } },
    { id: "frontend-dev", defaultLabel: "Frontend Dev", position: { x: 450, y: 100 } },
    { id: "backend-unit-test", defaultLabel: "Backend Unit Test", position: { x: 150, y: 200 } },
    { id: "frontend-unit-test", defaultLabel: "Frontend Unit Test", position: { x: 450, y: 200 } },
    { id: "code-cleanup", defaultLabel: "Code Cleanup", position: { x: 300, y: 300 } },
];

// Deploy — sequential push → plan → draft PR → push app → poll CI
const DEPLOY_NODES: DagNodeDef[] = [
    { id: "push-infra", defaultLabel: "Push Infra", position: { x: 300, y: 420 } },
    { id: "poll-infra-plan", defaultLabel: "Poll Infra Plan", position: { x: 300, y: 520 } },
    { id: "create-draft-pr", defaultLabel: "Create Draft PR", position: { x: 300, y: 620 } },
    { id: "push-app", defaultLabel: "Push App", position: { x: 300, y: 720 } },
    { id: "poll-app-ci", defaultLabel: "Poll App CI", position: { x: 300, y: 820 } },
];

// Post-deploy — parallel integration test + live UI
const POST_DEPLOY_NODES: DagNodeDef[] = [
    { id: "live-ui", defaultLabel: "Live UI", position: { x: 150, y: 940 } },
    { id: "integration-test", defaultLabel: "Integration Test", position: { x: 450, y: 940 } },
];

// Finalize — docs + create PR
const FINALIZE_NODES: DagNodeDef[] = [
    { id: "docs-archived", defaultLabel: "Docs Archived", position: { x: 300, y: 1060 } },
    { id: "create-pr", defaultLabel: "Create PR", position: { x: 300, y: 1160 } },
];

const ALL_NODE_DEFS: DagNodeDef[] = [
    ...PRE_DEPLOY_NODES,
    ...DEPLOY_NODES,
    ...POST_DEPLOY_NODES,
    ...FINALIZE_NODES,
];

// ---------------------------------------------------------------------------
// Static edges — contract-defined DAG order
// ---------------------------------------------------------------------------

const STATIC_EDGES: Edge[] = [
    // Pre-deploy: schema → parallel dev → parallel test → cleanup
    { id: "e-schema-dev->backend-dev", source: "schema-dev", target: "backend-dev" },
    { id: "e-schema-dev->frontend-dev", source: "schema-dev", target: "frontend-dev" },
    { id: "e-backend-dev->backend-unit-test", source: "backend-dev", target: "backend-unit-test" },
    { id: "e-frontend-dev->frontend-unit-test", source: "frontend-dev", target: "frontend-unit-test" },
    { id: "e-backend-unit-test->code-cleanup", source: "backend-unit-test", target: "code-cleanup" },
    { id: "e-frontend-unit-test->code-cleanup", source: "frontend-unit-test", target: "code-cleanup" },

    // Deploy: sequential push-infra → plan → draft PR → push-app → poll CI
    { id: "e-code-cleanup->push-infra", source: "code-cleanup", target: "push-infra" },
    { id: "e-push-infra->poll-infra-plan", source: "push-infra", target: "poll-infra-plan" },
    { id: "e-poll-infra-plan->create-draft-pr", source: "poll-infra-plan", target: "create-draft-pr" },
    { id: "e-create-draft-pr->push-app", source: "create-draft-pr", target: "push-app" },
    { id: "e-push-app->poll-app-ci", source: "push-app", target: "poll-app-ci" },

    // Post-deploy: parallel live-ui + integration-test
    { id: "e-poll-app-ci->live-ui", source: "poll-app-ci", target: "live-ui" },
    { id: "e-poll-app-ci->integration-test", source: "poll-app-ci", target: "integration-test" },

    // Finalize: converge → docs → create-pr
    { id: "e-live-ui->docs-archived", source: "live-ui", target: "docs-archived" },
    { id: "e-integration-test->docs-archived", source: "integration-test", target: "docs-archived" },
    { id: "e-docs-archived->create-pr", source: "docs-archived", target: "create-pr" },
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

/** Effective visual status for a node, derived from state + flight data. */
type VisualStatus = "active" | "done" | "failed" | "na" | "pending";

function deriveVisualStatus(
    stateItem: PipelineStateItem | undefined,
    flightItem: ItemSummary | undefined,
): VisualStatus {
    // Flight data "in-progress" overrides everything — the agent is actively running
    if (flightItem?.outcome === "in-progress") return "active";
    if (!stateItem) return "pending";
    if (stateItem.status === "done" && stateItem.error) return "failed";
    if (stateItem.status === "failed") return "failed";
    if (stateItem.status === "na") return "na";
    if (stateItem.status === "done") return "done";
    return "pending";
}

function getStatusStyle(status: VisualStatus): StatusStyle {
    switch (status) {
        case "active":
            return { background: "#dbeafe", border: "#3b82f6", color: "#1e3a5f", className: "pulse-blue" };
        case "done":
            return { background: "#dcfce7", border: "#22c55e", color: "#166534" };
        case "failed":
            return { background: "#fee2e2", border: "#ef4444", color: "#991b1b" };
        case "na":
            return { background: "#f3f4f6", border: "#9ca3af", color: "#9ca3af" };
        case "pending":
        default:
            return { background: "#f3f4f6", border: "#9ca3af", color: "#374151" };
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
        { refreshInterval: 3000, keepPreviousData: true },
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

    // Build a lookup map: item.key → latest ItemSummary from flight data
    const flightMap = useMemo(() => {
        const map = new Map<string, ItemSummary>();
        if (data?.flightData) {
            for (const item of data.flightData) {
                map.set(item.key, item); // last entry wins (latest attempt)
            }
        }
        return map;
    }, [data]);

    // Map static node defs → React Flow nodes with live status styles
    const nodes: Node[] = useMemo(() => {
        return ALL_NODE_DEFS.map((def) => {
            const stateItem = itemMap.get(def.id);
            const flightItem = flightMap.get(def.id);
            const visualStatus = deriveVisualStatus(stateItem, flightItem);
            const style = getStatusStyle(visualStatus);

            return {
                id: def.id,
                position: def.position,
                data: { label: stateItem?.label || def.defaultLabel },
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
    }, [itemMap, flightMap]);

    return (
        <div className="flex flex-col h-full w-full">
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

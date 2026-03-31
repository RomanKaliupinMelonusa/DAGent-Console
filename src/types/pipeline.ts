// ---------- _STATE.json ----------

export interface PipelineStateItem {
    key: string;
    label: string;
    agent: string;
    phase: string;
    status: "pending" | "active" | "done" | "na";
    error: string | null;
    docNote?: string;
}

export interface PipelineState {
    feature: string;
    workflowType: string;
    started: string;
    deployedUrl: string | null;
    implementationNotes: string | null;
    items: PipelineStateItem[];
}

// ---------- _FLIGHT_DATA.json ----------

export interface ItemSummary {
    key: string;
    label: string;
    agent: string;
    phase: string;
    attempt: number;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    outcome: "completed" | "failed" | "error" | "skipped" | "in-progress";
    intents: string[];
    messages: string[];
    filesRead: string[];
    filesChanged: string[];
    shellCommands: { command: string; timestamp: string; isPipelineOp: boolean }[];
    toolCounts: Record<string, number>;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    errorMessage?: string;
}

export type FlightData = ItemSummary[];

// ---------- _CHANGES.json ----------

export interface ChangeStep {
    key: string;
    agent: string;
    filesChanged: string[];
    docNote: string | null;
}

export interface ChangeManifest {
    feature: string;
    stepsCompleted: ChangeStep[];
    allFilesChanged: string[];
    summaryIntents: string[];
}

// ---------- Combined API Response ----------

export interface PipelineTelemetry {
    state: PipelineState;
    flightData: FlightData;
    changes: ChangeManifest;
    lastModified?: string;
}

// ---------- Pipeline Discovery (Launchpad) ----------

export type PipelineOverallStatus = "active" | "completed" | "failed";

export interface PipelineSummary {
    slug: string;
    feature: string;
    workflowType: string;
    started: string;
    overallStatus: PipelineOverallStatus;
    lastActivity: string | null;
    totalCost: number;
    activeStep: string | null;
}

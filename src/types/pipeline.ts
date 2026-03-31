// ---------- _STATE.json ----------

export interface PipelineStateItem {
    key: string;
    label: string;
    agent: string;
    phase: string;
    status: "pending" | "done" | "failed" | "na";
    error: string | null;
    docNote?: string | null;
}

export interface PipelineErrorLogEntry {
    timestamp: string;
    itemKey: string;
    message: string;
}

export interface PipelineState {
    feature: string;
    workflowType: string;
    started: string;
    deployedUrl: string | null;
    implementationNotes: string | null;
    items: PipelineStateItem[];
    errorLog: PipelineErrorLogEntry[];
}

// ---------- _FLIGHT_DATA.json ----------

export interface ShellEntry {
    command: string;
    timestamp: string;
    isPipelineOp: boolean;
}

export interface ItemSummary {
    key: string;
    label: string;
    agent: string;
    phase: string;
    attempt: number;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    outcome: "completed" | "failed" | "error" | "in-progress";
    intents: string[];
    messages: string[];
    filesRead: string[];
    filesChanged: string[];
    shellCommands: ShellEntry[];
    toolCounts: Record<string, number>;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    errorMessage?: string;
    headAfterAttempt?: string;
}

export interface FlightDataEnvelope {
    version: 1;
    generatedAt: string;
    featureSlug: string;
    items: ItemSummary[];
}

/** Convenience alias — always the items array extracted from the envelope. */
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
    /** Markdown files available in the pipeline directory. */
    markdownFiles?: {
        summary?: string;
        terminalLog?: string;
        playwrightLog?: string;
        transitionLog?: string;
    };
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

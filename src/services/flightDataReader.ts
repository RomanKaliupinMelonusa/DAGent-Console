import path from "path";
import { promises as fs } from "fs";
import type {
    PipelineState,
    FlightData,
    ChangeManifest,
    PipelineTelemetry,
    PipelineSummary,
    PipelineOverallStatus,
} from "@/types/pipeline";

export const DEFAULT_STATE: PipelineState = {
    feature: "",
    workflowType: "",
    started: "",
    deployedUrl: null,
    implementationNotes: null,
    items: [],
};

export const DEFAULT_FLIGHT_DATA: FlightData = [];

export const DEFAULT_CHANGES: ChangeManifest = {
    feature: "",
    stepsCompleted: [],
    allFilesChanged: [],
    summaryIntents: [],
};

const SAFE_SLUG_RE = /^[a-zA-Z0-9_-]+$/;

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
    try {
        const raw = await fs.readFile(filePath, "utf-8");
        return JSON.parse(raw) as T;
    } catch {
        return structuredClone(fallback);
    }
}

export async function getPipelineTelemetry(
    slug: string,
): Promise<PipelineTelemetry> {
    if (!SAFE_SLUG_RE.test(slug)) {
        return {
            state: structuredClone(DEFAULT_STATE),
            flightData: structuredClone(DEFAULT_FLIGHT_DATA),
            changes: structuredClone(DEFAULT_CHANGES),
        };
    }

    const basePath = path.join(
        process.env.TARGET_APP_PATH ?? "",
        "in-progress",
    );

    const [state, flightData, changes] = await Promise.all([
        readJsonFile<PipelineState>(
            path.join(basePath, `${slug}_STATE.json`),
            DEFAULT_STATE,
        ),
        readJsonFile<FlightData>(
            path.join(basePath, `${slug}_FLIGHT_DATA.json`),
            DEFAULT_FLIGHT_DATA,
        ),
        readJsonFile<ChangeManifest>(
            path.join(basePath, `${slug}_CHANGES.json`),
            DEFAULT_CHANGES,
        ),
    ]);

    return { state, flightData, changes };
}

export const DEFAULT_SPEC = "Spec file not found. Assume standard feature implementation.";

async function readTextFile(filePath: string, fallback: string): Promise<string> {
    try {
        return await fs.readFile(filePath, "utf-8");
    } catch {
        return fallback;
    }
}

export async function getSpecMarkdown(slug: string): Promise<string> {
    if (!SAFE_SLUG_RE.test(slug)) {
        return DEFAULT_SPEC;
    }

    const basePath = path.join(
        process.env.TARGET_APP_PATH ?? "",
        "in-progress",
    );

    return readTextFile(path.join(basePath, `${slug}_SPEC.md`), DEFAULT_SPEC);
}

// ---------------------------------------------------------------------------
// Flight data file freshness (for heartbeat indicator)
// ---------------------------------------------------------------------------

export async function getFlightDataMtime(slug: string): Promise<string | null> {
    if (!SAFE_SLUG_RE.test(slug)) return null;

    const filePath = path.join(
        process.env.TARGET_APP_PATH ?? "",
        "in-progress",
        `${slug}_FLIGHT_DATA.json`,
    );

    try {
        const stat = await fs.stat(filePath);
        return stat.mtime.toISOString();
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Pipeline discovery (Launchpad)
// ---------------------------------------------------------------------------

const INPUT_RATE = 0.015 / 1000;
const OUTPUT_RATE = 0.075 / 1000;
const CACHE_READ_RATE = 0.0015 / 1000;
const CACHE_WRITE_RATE = 0.00375 / 1000;

function calculateCost(flightData: FlightData): number {
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

function deriveOverallStatus(state: PipelineState): PipelineOverallStatus {
    const items = state.items;
    if (items.length === 0) return "active";
    if (items.some((i) => i.status === "active")) return "active";
    const hasError = items.some((i) => i.error !== null);
    if (hasError) return "failed";
    return "completed";
}

const STATE_SUFFIX = "_STATE.json";

export async function listPipelines(): Promise<PipelineSummary[]> {
    const basePath = path.join(
        process.env.TARGET_APP_PATH ?? "",
        "in-progress",
    );

    let entries: string[];
    try {
        entries = await fs.readdir(basePath);
    } catch {
        return [];
    }

    const slugs = entries
        .filter((f) => f.endsWith(STATE_SUFFIX))
        .map((f) => f.slice(0, -STATE_SUFFIX.length))
        .filter((s) => SAFE_SLUG_RE.test(s));

    const summaries = await Promise.all(
        slugs.map(async (slug): Promise<PipelineSummary> => {
            const state = await readJsonFile<PipelineState>(
                path.join(basePath, `${slug}_STATE.json`),
                DEFAULT_STATE,
            );
            const flightData = await readJsonFile<FlightData>(
                path.join(basePath, `${slug}_FLIGHT_DATA.json`),
                DEFAULT_FLIGHT_DATA,
            );

            const activeItem = state.items.find((i) => i.status === "active");
            const lastFlight = flightData.length > 0
                ? flightData[flightData.length - 1]
                : null;

            return {
                slug,
                feature: state.feature || slug,
                workflowType: state.workflowType || "unknown",
                started: state.started || "",
                overallStatus: deriveOverallStatus(state),
                lastActivity: lastFlight?.finishedAt ?? lastFlight?.startedAt ?? null,
                totalCost: calculateCost(flightData),
                activeStep: activeItem?.label ?? null,
            };
        }),
    );

    // Sort: active first, then by started descending
    summaries.sort((a, b) => {
        if (a.overallStatus === "active" && b.overallStatus !== "active") return -1;
        if (a.overallStatus !== "active" && b.overallStatus === "active") return 1;
        return b.started.localeCompare(a.started);
    });

    return summaries;
}

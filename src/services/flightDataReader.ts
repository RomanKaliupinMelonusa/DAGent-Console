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

function isEnoent(err: unknown): boolean {
    return (err as NodeJS.ErrnoException)?.code === "ENOENT";
}

/**
 * Returns [inProgressPath, archivePath] for a given slug + filename.
 */
function candidatePaths(slug: string, fileName: string): [string, string] {
    const base = process.env.TARGET_APP_PATH ?? "";
    return [
        path.join(base, "in-progress", fileName),
        path.join(base, "archive", "features", slug, fileName),
    ];
}

async function readJsonFile<T>(filePaths: string | string[], fallback: T): Promise<T> {
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    for (const p of paths) {
        try {
            const raw = await fs.readFile(p, "utf-8");
            return JSON.parse(raw) as T;
        } catch (err) {
            if (isEnoent(err)) continue;
            return structuredClone(fallback);
        }
    }
    return structuredClone(fallback);
}

async function readTextFile(filePaths: string | string[], fallback: string): Promise<string> {
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    for (const p of paths) {
        try {
            return await fs.readFile(p, "utf-8");
        } catch (err) {
            if (isEnoent(err)) continue;
            return fallback;
        }
    }
    return fallback;
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

    const [state, flightData, changes] = await Promise.all([
        readJsonFile<PipelineState>(
            candidatePaths(slug, `${slug}_STATE.json`),
            DEFAULT_STATE,
        ),
        readJsonFile<FlightData>(
            candidatePaths(slug, `${slug}_FLIGHT_DATA.json`),
            DEFAULT_FLIGHT_DATA,
        ),
        readJsonFile<ChangeManifest>(
            candidatePaths(slug, `${slug}_CHANGES.json`),
            DEFAULT_CHANGES,
        ),
    ]);

    return { state, flightData, changes };
}

export const DEFAULT_SPEC = "Spec file not found. Assume standard feature implementation.";

export async function getSpecMarkdown(slug: string): Promise<string> {
    if (!SAFE_SLUG_RE.test(slug)) {
        return DEFAULT_SPEC;
    }

    return readTextFile(candidatePaths(slug, `${slug}_SPEC.md`), DEFAULT_SPEC);
}

// ---------------------------------------------------------------------------
// Flight data file freshness (for heartbeat indicator)
// ---------------------------------------------------------------------------

export async function getFlightDataMtime(slug: string): Promise<string | null> {
    if (!SAFE_SLUG_RE.test(slug)) return null;

    const paths = candidatePaths(slug, `${slug}_FLIGHT_DATA.json`);
    for (const p of paths) {
        try {
            const stat = await fs.stat(p);
            return stat.mtime.toISOString();
        } catch (err) {
            if (isEnoent(err)) continue;
            return null;
        }
    }
    return null;
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

async function discoverSlugsInProgress(base: string): Promise<string[]> {
    const dir = path.join(base, "in-progress");
    let entries: string[];
    try {
        entries = await fs.readdir(dir);
    } catch {
        return [];
    }
    return entries
        .filter((f) => f.endsWith(STATE_SUFFIX))
        .map((f) => f.slice(0, -STATE_SUFFIX.length))
        .filter((s) => SAFE_SLUG_RE.test(s));
}

async function discoverSlugsInArchive(base: string): Promise<string[]> {
    const archiveDir = path.join(base, "archive", "features");
    let dirs: string[];
    try {
        dirs = await fs.readdir(archiveDir);
    } catch {
        return [];
    }

    const safeDirs = dirs.filter((name) => SAFE_SLUG_RE.test(name));

    const results = await Promise.all(
        safeDirs.map(async (name): Promise<string | null> => {
            try {
                const contents = await fs.readdir(path.join(archiveDir, name));
                // Only accept if the directory's own STATE file exists
                if (contents.includes(`${name}${STATE_SUFFIX}`)) {
                    return name;
                }
            } catch {
                // subdirectory unreadable — skip
            }
            return null;
        }),
    );

    return results.filter((s): s is string => s !== null);
}

async function buildSummary(slug: string): Promise<PipelineSummary> {
    const state = await readJsonFile<PipelineState>(
        candidatePaths(slug, `${slug}_STATE.json`),
        DEFAULT_STATE,
    );
    const flightData = await readJsonFile<FlightData>(
        candidatePaths(slug, `${slug}_FLIGHT_DATA.json`),
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
}

export async function listPipelines(): Promise<PipelineSummary[]> {
    const base = process.env.TARGET_APP_PATH ?? "";

    const [inProgressSlugs, archiveSlugs] = await Promise.all([
        discoverSlugsInProgress(base),
        discoverSlugsInArchive(base),
    ]);

    // Deduplicate: in-progress takes priority
    const seen = new Set(inProgressSlugs);
    const allSlugs = [...inProgressSlugs];
    for (const s of archiveSlugs) {
        if (!seen.has(s)) {
            seen.add(s);
            allSlugs.push(s);
        }
    }

    const summaries = await Promise.all(allSlugs.map(buildSummary));

    // Sort: active first, then by started descending
    summaries.sort((a, b) => {
        if (a.overallStatus === "active" && b.overallStatus !== "active") return -1;
        if (a.overallStatus !== "active" && b.overallStatus === "active") return 1;
        return b.started.localeCompare(a.started);
    });

    return summaries;
}

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
    errorLog: [],
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

/**
 * Read flight data JSON which may be:
 *   - An envelope: { version: 1, generatedAt, featureSlug, items: [...] }
 *   - A bare array: [...]  (legacy/test format)
 * Always returns the items array.
 */
async function readFlightData(filePaths: string[]): Promise<FlightData> {
    for (const p of filePaths) {
        try {
            const raw = await fs.readFile(p, "utf-8");
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed as FlightData;
            if (parsed && typeof parsed === "object" && Array.isArray(parsed.items)) {
                // Validate envelope version for forward-compat
                if (parsed.version !== undefined && parsed.version !== 1) {
                    // Unknown version — return items best-effort but log nothing
                }
                return parsed.items as FlightData;
            }
            return [];
        } catch (err) {
            if (isEnoent(err)) continue;
            return [];
        }
    }
    return [];
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

// ---------------------------------------------------------------------------
// APM config (apm.yml) — agent tool limits + token budget
// ---------------------------------------------------------------------------

interface ApmAgentConfig {
    toolLimits?: { soft: number; hard: number };
}

interface ApmConfig {
    tokenBudget?: number;
    agents?: Record<string, ApmAgentConfig>;
    config?: { defaultToolLimits?: { soft: number; hard: number } };
}

let apmConfigCache: { data: ApmConfig; mtime: number } | null = null;

async function readApmConfig(): Promise<ApmConfig> {
    const base = process.env.TARGET_APP_PATH ?? "";
    const apmPath = path.join(base, ".apm", "apm.yml");
    try {
        const stat = await fs.stat(apmPath);
        if (apmConfigCache && apmConfigCache.mtime === stat.mtimeMs) {
            return apmConfigCache.data;
        }
        const raw = await fs.readFile(apmPath, "utf-8");
        // Simple YAML parser — enough for apm.yml structure
        const config = parseSimpleApmYaml(raw);
        apmConfigCache = { data: config, mtime: stat.mtimeMs };
        return config;
    } catch {
        return {};
    }
}

function parseSimpleApmYaml(raw: string): ApmConfig {
    const result: ApmConfig = { agents: {} };

    // Extract tokenBudget
    const budgetMatch = raw.match(/^tokenBudget:\s*(\d+)/m);
    if (budgetMatch) result.tokenBudget = parseInt(budgetMatch[1], 10);

    // Extract defaultToolLimits from config section
    const defaultMatch = raw.match(/defaultToolLimits:\s*\{\s*soft:\s*(\d+)\s*,\s*hard:\s*(\d+)\s*\}/);
    if (defaultMatch) {
        result.config = { defaultToolLimits: { soft: parseInt(defaultMatch[1], 10), hard: parseInt(defaultMatch[2], 10) } };
    }

    // Extract per-agent toolLimits
    const agentSection = raw.indexOf("\nagents:");
    if (agentSection === -1) return result;

    const agentBlock = raw.slice(agentSection);
    const agentRegex = /^ {2}([a-zA-Z0-9_-]+):\n(?:[\s\S]*?)toolLimits:\s*\{\s*soft:\s*(\d+)\s*,\s*hard:\s*(\d+)\s*\}/gm;
    let match;
    while ((match = agentRegex.exec(agentBlock)) !== null) {
        result.agents![match[1]] = {
            toolLimits: { soft: parseInt(match[2], 10), hard: parseInt(match[3], 10) },
        };
    }

    return result;
}

export { parseSimpleApmYaml };

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

    const [state, flightData, changes, summary, terminalLog, playwrightLog, transitionLog, apmConfig] =
        await Promise.all([
            readJsonFile<PipelineState>(
                candidatePaths(slug, `${slug}_STATE.json`),
                DEFAULT_STATE,
            ),
            readFlightData(
                candidatePaths(slug, `${slug}_FLIGHT_DATA.json`),
            ),
            readJsonFile<ChangeManifest>(
                candidatePaths(slug, `${slug}_CHANGES.json`),
                DEFAULT_CHANGES,
            ),
            readTextFile(candidatePaths(slug, `${slug}_SUMMARY.md`), ""),
            readTextFile(candidatePaths(slug, `${slug}_TERMINAL-LOG.md`), ""),
            readTextFile(candidatePaths(slug, `${slug}_PLAYWRIGHT-LOG.md`), ""),
            readTextFile(candidatePaths(slug, `${slug}_TRANS.md`), ""),
            readApmConfig(),
        ]);

    // Build per-agent tool limits map
    const agentToolLimits: Record<string, { soft: number; hard: number }> = {};
    const defaultLimits = apmConfig.config?.defaultToolLimits ?? { soft: 30, hard: 40 };
    if (apmConfig.agents) {
        for (const [key, agent] of Object.entries(apmConfig.agents)) {
            agentToolLimits[key] = agent.toolLimits ?? defaultLimits;
        }
    }

    return {
        state,
        flightData,
        changes,
        markdownFiles: {
            summary: summary || undefined,
            terminalLog: terminalLog || undefined,
            playwrightLog: playwrightLog || undefined,
            transitionLog: transitionLog || undefined,
        },
        agentToolLimits: Object.keys(agentToolLimits).length > 0 ? agentToolLimits : undefined,
        tokenBudget: apmConfig.tokenBudget,
    };
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

function deriveOverallStatus(state: PipelineState, flightData: FlightData): PipelineOverallStatus {
    const items = state.items;
    // Check flight data for any in-progress step
    if (flightData.some((f) => f.outcome === "in-progress")) return "active";
    if (items.length === 0) return "active";
    // All items resolved — check for failures
    const allResolved = items.every((i) => i.status === "done" || i.status === "na");
    if (!allResolved) return "active"; // some items still pending
    const hasError = items.some((i) => i.error !== null || i.status === "failed");
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
    const flightData = await readFlightData(
        candidatePaths(slug, `${slug}_FLIGHT_DATA.json`),
    );

    // Active step = last flight data item with outcome "in-progress",
    // or fallback to first pending state item
    const inProgressItem = flightData.find((f) => f.outcome === "in-progress");
    const pendingItem = state.items.find((i) => i.status === "pending");
    const activeLabel = inProgressItem?.label ?? pendingItem?.label ?? null;

    const lastFlight = flightData.length > 0
        ? flightData[flightData.length - 1]
        : null;

    return {
        slug,
        feature: state.feature || slug,
        workflowType: state.workflowType || "unknown",
        started: state.started || "",
        overallStatus: deriveOverallStatus(state, flightData),
        lastActivity: lastFlight?.finishedAt ?? lastFlight?.startedAt ?? null,
        totalCost: calculateCost(flightData),
        activeStep: activeLabel,
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

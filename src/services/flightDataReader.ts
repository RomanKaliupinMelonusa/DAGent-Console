import path from "path";
import { promises as fs } from "fs";
import type {
    PipelineState,
    FlightData,
    ChangeManifest,
    PipelineTelemetry,
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

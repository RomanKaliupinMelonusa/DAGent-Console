import { promises as fs } from "fs";
import {
    getPipelineTelemetry,
    getFlightDataMtime,
    getSpecMarkdown,
    listPipelines,
    DEFAULT_STATE,
    DEFAULT_FLIGHT_DATA,
    DEFAULT_CHANGES,
    DEFAULT_SPEC,
} from "@/services/flightDataReader";
import type {
    PipelineState,
    FlightData,
    ChangeManifest,
} from "@/types/pipeline";

jest.mock("fs", () => ({
    promises: {
        readFile: jest.fn(),
        readdir: jest.fn(),
        stat: jest.fn(),
    },
}));

const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
const mockReaddir = fs.readdir as jest.MockedFunction<typeof fs.readdir>;
const mockStat = fs.stat as jest.MockedFunction<typeof fs.stat>;

const SLUG = "add-login";
const IN_PROGRESS_DIR = "/mock/app/in-progress";
const ARCHIVE_DIR = "/mock/app/archive/features";

function enoent(msg = "ENOENT: no such file") {
    return Object.assign(new Error(msg), { code: "ENOENT" });
}

const VALID_STATE: PipelineState = {
    feature: "add-login",
    workflowType: "implement",
    started: "2026-03-31T10:00:00Z",
    deployedUrl: null,
    implementationNotes: null,
    items: [
        {
            key: "plan",
            label: "Planning",
            agent: "planner",
            phase: "plan",
            status: "done",
            error: null,
        },
        {
            key: "code",
            label: "Coding",
            agent: "coder",
            phase: "implement",
            status: "pending",
            error: null,
        },
    ],
    errorLog: [],
};

const VALID_FLIGHT_DATA: FlightData = [
    {
        key: "plan",
        label: "Planning",
        agent: "planner",
        phase: "plan",
        attempt: 1,
        startedAt: "2026-03-31T10:00:00Z",
        finishedAt: "2026-03-31T10:01:00Z",
        durationMs: 60000,
        outcome: "completed",
        intents: ["read-spec", "generate-plan"],
        messages: ["Plan generated successfully"],
        filesRead: ["spec.md"],
        filesChanged: ["plan.md"],
        shellCommands: [
            { command: "cat spec.md", timestamp: "2026-03-31T10:00:05Z", isPipelineOp: false },
        ],
        toolCounts: { read_file: 2, write_file: 1 },
        inputTokens: 1500,
        outputTokens: 800,
        cacheReadTokens: 200,
        cacheWriteTokens: 100,
    },
];

const VALID_CHANGES: ChangeManifest = {
    feature: "add-login",
    stepsCompleted: [
        {
            key: "plan",
            agent: "planner",
            filesChanged: ["plan.md"],
            docNote: "Generated implementation plan from spec",
        },
    ],
    allFilesChanged: ["plan.md"],
    summaryIntents: ["read-spec", "generate-plan"],
};

let originalTargetAppPath: string | undefined;

beforeEach(() => {
    originalTargetAppPath = process.env.TARGET_APP_PATH;
    process.env.TARGET_APP_PATH = "/mock/app";
    mockReadFile.mockReset();
    mockReaddir.mockReset();
    mockStat.mockReset();
});

afterEach(() => {
    if (originalTargetAppPath === undefined) {
        delete process.env.TARGET_APP_PATH;
    } else {
        process.env.TARGET_APP_PATH = originalTargetAppPath;
    }
});

// Helpers to distinguish in-progress vs archive paths
function isInProgressPath(p: string) { return p.startsWith(IN_PROGRESS_DIR); }
function isArchivePath(p: string) { return p.startsWith(ARCHIVE_DIR); }

describe("getPipelineTelemetry", () => {
    it("returns parsed data for all three files (happy path)", async () => {
        mockReadFile.mockImplementation(async (filePath) => {
            const p = String(filePath);
            if (p.endsWith(`${SLUG}_STATE.json`)) return JSON.stringify(VALID_STATE);
            if (p.endsWith(`${SLUG}_FLIGHT_DATA.json`)) return JSON.stringify(VALID_FLIGHT_DATA);
            if (p.endsWith(`${SLUG}_CHANGES.json`)) return JSON.stringify(VALID_CHANGES);
            // Markdown files — return empty
            if (p.endsWith(".md")) throw enoent();
            throw enoent();
        });

        const telemetry = await getPipelineTelemetry(SLUG);

        expect(telemetry.state).toEqual(VALID_STATE);
        expect(telemetry.state.items[0].status).toBe("done");
        expect(telemetry.state.items[1].status).toBe("pending");

        expect(telemetry.flightData).toEqual(VALID_FLIGHT_DATA);
        expect(telemetry.flightData[0].toolCounts).toEqual({ read_file: 2, write_file: 1 });
        expect(telemetry.flightData[0].intents).toEqual(["read-spec", "generate-plan"]);
        expect(telemetry.flightData[0].shellCommands).toHaveLength(1);

        expect(telemetry.changes).toEqual(VALID_CHANGES);
        expect(telemetry.changes.stepsCompleted[0].docNote).toBe(
            "Generated implementation plan from spec",
        );
        expect(telemetry.changes.allFilesChanged).toEqual(["plan.md"]);
        expect(telemetry.changes.summaryIntents).toEqual(["read-spec", "generate-plan"]);
    });

    it("returns safe defaults when files are missing (ENOENT)", async () => {
        mockReadFile.mockRejectedValue(enoent());

        const telemetry = await getPipelineTelemetry(SLUG);

        expect(telemetry.state).toEqual(DEFAULT_STATE);
        expect(telemetry.flightData).toEqual(DEFAULT_FLIGHT_DATA);
        expect(telemetry.changes).toEqual(DEFAULT_CHANGES);
    });

    it("returns safe defaults when files contain corrupt JSON", async () => {
        mockReadFile.mockResolvedValue("{{not valid json!!" as never);

        const telemetry = await getPipelineTelemetry(SLUG);

        expect(telemetry.state).toEqual(DEFAULT_STATE);
        expect(telemetry.flightData).toEqual(DEFAULT_FLIGHT_DATA);
        expect(telemetry.changes).toEqual(DEFAULT_CHANGES);
    });

    it("returns parsed data for present files and defaults for missing ones", async () => {
        mockReadFile.mockImplementation(async (filePath) => {
            const p = String(filePath);
            if (p.endsWith(`${SLUG}_STATE.json`)) return JSON.stringify(VALID_STATE);
            throw enoent();
        });

        const telemetry = await getPipelineTelemetry(SLUG);

        expect(telemetry.state).toEqual(VALID_STATE);
        expect(telemetry.flightData).toEqual(DEFAULT_FLIGHT_DATA);
        expect(telemetry.changes).toEqual(DEFAULT_CHANGES);
    });

    it("returns safe defaults for path-traversal slugs without reading files", async () => {
        const maliciousSlugs = ["../../etc/passwd", "../secret", "foo/bar", "a b c", "slug;rm -rf"];

        for (const badSlug of maliciousSlugs) {
            const telemetry = await getPipelineTelemetry(badSlug);

            expect(telemetry.state).toEqual(DEFAULT_STATE);
            expect(telemetry.flightData).toEqual(DEFAULT_FLIGHT_DATA);
            expect(telemetry.changes).toEqual(DEFAULT_CHANGES);
        }

        expect(mockReadFile).not.toHaveBeenCalled();
    });

    it("returns independent default objects (no shared references)", async () => {
        mockReadFile.mockRejectedValue(enoent());

        const first = await getPipelineTelemetry(SLUG);
        first.state.items.push({
            key: "mutated",
            label: "Mutated",
            agent: "test",
            phase: "test",
            status: "done",
            error: null,
        });

        const second = await getPipelineTelemetry(SLUG);
        expect(second.state.items).toEqual([]);
    });

    it("falls back to archive when in-progress files are missing", async () => {
        mockReadFile.mockImplementation(async (filePath) => {
            const p = String(filePath);
            // In-progress paths throw ENOENT
            if (isInProgressPath(p)) throw enoent();
            // Archive paths succeed
            if (p.endsWith(`${SLUG}_STATE.json`)) return JSON.stringify(VALID_STATE);
            if (p.endsWith(`${SLUG}_FLIGHT_DATA.json`)) return JSON.stringify(VALID_FLIGHT_DATA);
            if (p.endsWith(`${SLUG}_CHANGES.json`)) return JSON.stringify(VALID_CHANGES);
            throw enoent();
        });

        const telemetry = await getPipelineTelemetry(SLUG);

        expect(telemetry.state).toEqual(VALID_STATE);
        expect(telemetry.flightData).toEqual(VALID_FLIGHT_DATA);
        expect(telemetry.changes).toEqual(VALID_CHANGES);

        // Verify archive paths were used (should contain archive/features/slug/)
        const calledPaths = mockReadFile.mock.calls.map((c) => String(c[0]));
        expect(calledPaths.some((p) => p.includes("archive/features/add-login/"))).toBe(true);
    });

    it("does not cascade to archive on corrupt JSON (non-ENOENT error)", async () => {
        mockReadFile.mockImplementation(async (filePath) => {
            const p = String(filePath);
            // In-progress returns corrupt JSON
            if (isInProgressPath(p) && p.endsWith(`${SLUG}_STATE.json`)) return "{{broken" as never;
            // Archive should NOT be reached for STATE (but ENOENT for flight/changes triggers archive)
            if (isArchivePath(p) && p.endsWith(`${SLUG}_STATE.json`)) return JSON.stringify(VALID_STATE);
            throw enoent();
        });

        const telemetry = await getPipelineTelemetry(SLUG);

        // Corrupt JSON → default; does NOT fall through to archive
        expect(telemetry.state).toEqual(DEFAULT_STATE);
    });
});

// =========================================================================
// getSpecMarkdown
// =========================================================================

describe("getSpecMarkdown", () => {
    it("returns spec from in-progress when available", async () => {
        mockReadFile.mockImplementation(async (filePath) => {
            const p = String(filePath);
            if (isInProgressPath(p) && p.endsWith(`${SLUG}_SPEC.md`)) return "# My Spec";
            throw enoent();
        });

        const result = await getSpecMarkdown(SLUG);
        expect(result).toBe("# My Spec");
    });

    it("falls back to archive when in-progress is missing", async () => {
        mockReadFile.mockImplementation(async (filePath) => {
            const p = String(filePath);
            if (isInProgressPath(p)) throw enoent();
            if (isArchivePath(p) && p.endsWith(`${SLUG}_SPEC.md`)) return "# Archived Spec";
            throw enoent();
        });

        const result = await getSpecMarkdown(SLUG);
        expect(result).toBe("# Archived Spec");

        const calledPaths = mockReadFile.mock.calls.map((c) => String(c[0]));
        expect(calledPaths).toHaveLength(2);
        expect(calledPaths[1]).toContain(`archive/features/${SLUG}/`);
    });

    it("returns default when both locations are missing", async () => {
        mockReadFile.mockRejectedValue(enoent());
        const result = await getSpecMarkdown(SLUG);
        expect(result).toBe(DEFAULT_SPEC);
    });

    it("returns default for invalid slugs without reading files", async () => {
        const result = await getSpecMarkdown("../../etc/passwd");
        expect(result).toBe(DEFAULT_SPEC);
        expect(mockReadFile).not.toHaveBeenCalled();
    });
});

// =========================================================================
// getFlightDataMtime
// =========================================================================

describe("getFlightDataMtime", () => {
    it("returns ISO mtime when file exists in in-progress", async () => {
        const mtime = new Date("2026-03-31T12:00:00Z");
        mockStat.mockResolvedValue({ mtime } as unknown as Awaited<ReturnType<typeof fs.stat>>);

        const result = await getFlightDataMtime(SLUG);
        expect(result).toBe(mtime.toISOString());
    });

    it("returns null when file does not exist in either location", async () => {
        mockStat.mockRejectedValue(enoent());
        const result = await getFlightDataMtime(SLUG);
        expect(result).toBeNull();
    });

    it("returns null for invalid slugs", async () => {
        mockStat.mockClear();
        const result = await getFlightDataMtime("../../etc/passwd");
        expect(result).toBeNull();
        expect(mockStat).not.toHaveBeenCalled();
    });

    it("falls back to archive path when in-progress stat fails with ENOENT", async () => {
        const mtime = new Date("2026-03-30T08:00:00Z");
        mockStat.mockImplementation(async (filePath) => {
            const p = String(filePath);
            if (isInProgressPath(p)) throw enoent();
            return { mtime } as unknown as Awaited<ReturnType<typeof fs.stat>>;
        });

        const result = await getFlightDataMtime(SLUG);
        expect(result).toBe(mtime.toISOString());

        // Verify both paths were tried
        const calledPaths = mockStat.mock.calls.map((c) => String(c[0]));
        expect(calledPaths).toHaveLength(2);
        expect(calledPaths[0]).toContain("in-progress");
        expect(calledPaths[1]).toContain("archive/features/add-login/");
    });
});

// =========================================================================
// listPipelines
// =========================================================================

/**
 * Helper: set up mockReaddir to serve different results for in-progress vs archive dirs.
 */
function setupReaddir(
    inProgressFiles: string[],
    archiveSubdirs: string[],
    subdirContents: Record<string, string[]> = {},
) {
    mockReaddir.mockImplementation(async (dirPath) => {
        const d = String(dirPath);
        if (d === IN_PROGRESS_DIR) {
            return inProgressFiles as unknown as Awaited<ReturnType<typeof fs.readdir>>;
        }
        if (d === ARCHIVE_DIR) {
            return archiveSubdirs as unknown as Awaited<ReturnType<typeof fs.readdir>>;
        }
        // Subdirectory inside archive
        for (const [name, contents] of Object.entries(subdirContents)) {
            if (d === `${ARCHIVE_DIR}/${name}`) {
                return contents as unknown as Awaited<ReturnType<typeof fs.readdir>>;
            }
        }
        throw enoent();
    });
}

describe("listPipelines", () => {
    it("returns empty array when both directories do not exist", async () => {
        mockReaddir.mockRejectedValue(enoent());
        const result = await listPipelines();
        expect(result).toEqual([]);
    });

    it("returns empty array when in-progress directory does not exist and archive is empty", async () => {
        setupReaddir([], [], {});
        // Override in-progress to throw ENOENT
        mockReaddir.mockImplementation(async (dirPath) => {
            const d = String(dirPath);
            if (d === IN_PROGRESS_DIR) throw enoent();
            if (d === ARCHIVE_DIR) return [] as unknown as Awaited<ReturnType<typeof fs.readdir>>;
            throw enoent();
        });

        const result = await listPipelines();
        expect(result).toEqual([]);
    });

    it("discovers slugs from _STATE.json files and returns summaries", async () => {
        setupReaddir(
            ["feature-a_STATE.json", "feature-a_FLIGHT_DATA.json", "feature-b_STATE.json", "README.md"],
            [],
            {},
        );

        const stateA: PipelineState = {
            feature: "Feature A",
            workflowType: "implement",
            started: "2026-03-31T10:00:00Z",
            deployedUrl: null,
            implementationNotes: null,
            items: [
                { key: "plan", label: "Planning", agent: "planner", phase: "plan", status: "done", error: null },
                { key: "code", label: "Coding", agent: "coder", phase: "implement", status: "pending", error: null },
            ],
            errorLog: [],
        };

        const stateB: PipelineState = {
            feature: "Feature B",
            workflowType: "implement",
            started: "2026-03-31T09:00:00Z",
            deployedUrl: null,
            implementationNotes: null,
            items: [
                { key: "plan", label: "Planning", agent: "planner", phase: "plan", status: "done", error: null },
            ],
            errorLog: [],
        };

        mockReadFile.mockImplementation(async (filePath) => {
            const p = String(filePath);
            if (p.endsWith("feature-a_STATE.json")) return JSON.stringify(stateA);
            if (p.endsWith("feature-b_STATE.json")) return JSON.stringify(stateB);
            if (p.endsWith("_FLIGHT_DATA.json")) return "[]";
            if (p.endsWith(".md")) throw enoent();
            throw enoent();
        });

        const result = await listPipelines();

        expect(result).toHaveLength(2);
        // Active pipelines sort first (feature-a has pending items)
        expect(result[0].slug).toBe("feature-a");
        expect(result[0].overallStatus).toBe("active");
        expect(result[0].activeStep).toBe("Coding");
        expect(result[1].slug).toBe("feature-b");
        expect(result[1].overallStatus).toBe("completed");
    });

    it("skips files with unsafe slug patterns", async () => {
        setupReaddir(
            ["good-slug_STATE.json", "bad slug_STATE.json", "../evil_STATE.json"],
            [],
            {},
        );

        mockReadFile.mockImplementation(async (filePath) => {
            const p = String(filePath);
            if (p.endsWith("good-slug_STATE.json")) return JSON.stringify(VALID_STATE);
            if (p.endsWith("_FLIGHT_DATA.json")) return "[]";
            throw enoent();
        });

        const result = await listPipelines();
        expect(result).toHaveLength(1);
        expect(result[0].slug).toBe("good-slug");
    });

    it("derives 'failed' status when items have errors", async () => {
        setupReaddir(["fail_STATE.json"], [], {});

        const failedState: PipelineState = {
            feature: "Failing Feature",
            workflowType: "implement",
            started: "2026-03-31T10:00:00Z",
            deployedUrl: null,
            implementationNotes: null,
            items: [
                { key: "code", label: "Coding", agent: "coder", phase: "implement", status: "done", error: "Playwright timeout" },
            ],
            errorLog: [],
        };

        mockReadFile.mockImplementation(async (filePath) => {
            const p = String(filePath);
            if (p.endsWith("fail_STATE.json")) return JSON.stringify(failedState);
            if (p.endsWith("_FLIGHT_DATA.json")) return "[]";
            throw enoent();
        });

        const result = await listPipelines();
        expect(result[0].overallStatus).toBe("failed");
    });

    it("discovers completed pipelines in archive/features subdirectories", async () => {
        const completedState: PipelineState = {
            feature: "Archived Feature",
            workflowType: "implement",
            started: "2026-03-30T08:00:00Z",
            deployedUrl: null,
            implementationNotes: null,
            items: [
                { key: "plan", label: "Planning", agent: "planner", phase: "plan", status: "done", error: null },
                { key: "code", label: "Coding", agent: "coder", phase: "implement", status: "done", error: null },
            ],
            errorLog: [],
        };

        // No in-progress pipelines; one archived pipeline
        setupReaddir(
            [],
            ["archived-feat"],
            { "archived-feat": ["archived-feat_STATE.json", "archived-feat_FLIGHT_DATA.json"] },
        );

        mockReadFile.mockImplementation(async (filePath) => {
            const p = String(filePath);
            if (p.endsWith("archived-feat_STATE.json")) return JSON.stringify(completedState);
            if (p.endsWith("_FLIGHT_DATA.json")) return "[]";
            throw enoent();
        });

        const result = await listPipelines();

        expect(result).toHaveLength(1);
        expect(result[0].slug).toBe("archived-feat");
        expect(result[0].feature).toBe("Archived Feature");
        expect(result[0].overallStatus).toBe("completed");
    });

    it("combines pipelines from both directories and deduplicates by slug", async () => {
        const activeState: PipelineState = {
            feature: "Active Feature",
            workflowType: "implement",
            started: "2026-03-31T10:00:00Z",
            deployedUrl: null,
            implementationNotes: null,
            items: [
                { key: "code", label: "Coding", agent: "coder", phase: "implement", status: "pending", error: null },
            ],
            errorLog: [],
        };

        const archivedState: PipelineState = {
            feature: "Done Feature",
            workflowType: "implement",
            started: "2026-03-29T08:00:00Z",
            deployedUrl: null,
            implementationNotes: null,
            items: [
                { key: "plan", label: "Planning", agent: "planner", phase: "plan", status: "done", error: null },
            ],
            errorLog: [],
        };

        setupReaddir(
            ["active-feat_STATE.json"],
            ["active-feat", "done-feat"],
            {
                "active-feat": ["active-feat_STATE.json"],
                "done-feat": ["done-feat_STATE.json", "done-feat_FLIGHT_DATA.json"],
            },
        );

        mockReadFile.mockImplementation(async (filePath) => {
            const p = String(filePath);
            if (p.endsWith("active-feat_STATE.json")) return JSON.stringify(activeState);
            if (p.endsWith("done-feat_STATE.json")) return JSON.stringify(archivedState);
            if (p.endsWith("_FLIGHT_DATA.json")) return "[]";
            throw enoent();
        });

        const result = await listPipelines();

        expect(result).toHaveLength(2);
        // active-feat appears once (not duplicated despite being in both directories)
        const slugs = result.map((r) => r.slug);
        expect(slugs).toContain("active-feat");
        expect(slugs).toContain("done-feat");
        expect(slugs.filter((s) => s === "active-feat")).toHaveLength(1);
        // Active pipelines sort first
        expect(result[0].slug).toBe("active-feat");
        expect(result[0].overallStatus).toBe("active");
    });

    it("skips unsafe directory names in archive", async () => {
        setupReaddir(
            [],
            ["good-slug", "../evil", "bad slug"],
            { "good-slug": ["good-slug_STATE.json"] },
        );

        mockReadFile.mockImplementation(async (filePath) => {
            const p = String(filePath);
            if (p.endsWith("good-slug_STATE.json")) return JSON.stringify(VALID_STATE);
            if (p.endsWith("_FLIGHT_DATA.json")) return "[]";
            throw enoent();
        });

        const result = await listPipelines();
        expect(result).toHaveLength(1);
        expect(result[0].slug).toBe("good-slug");
    });

    it("skips archive subdirectories that have no _STATE.json file", async () => {
        setupReaddir(
            [],
            ["no-state-dir"],
            { "no-state-dir": ["some_FLIGHT_DATA.json", "README.md"] },
        );

        const result = await listPipelines();
        expect(result).toEqual([]);
    });

    it("skips archive subdirectory whose STATE file belongs to a different slug", async () => {
        // archive/features/dirA/ contains otherSlug_STATE.json, NOT dirA_STATE.json
        setupReaddir(
            [],
            ["dirA"],
            { "dirA": ["otherSlug_STATE.json", "otherSlug_FLIGHT_DATA.json"] },
        );

        const result = await listPipelines();
        expect(result).toEqual([]);
    });
});

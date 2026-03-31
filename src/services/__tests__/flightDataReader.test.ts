import { promises as fs } from "fs";
import {
    getPipelineTelemetry,
    DEFAULT_STATE,
    DEFAULT_FLIGHT_DATA,
    DEFAULT_CHANGES,
} from "@/services/flightDataReader";
import type {
    PipelineState,
    FlightData,
    ChangeManifest,
} from "@/types/pipeline";

jest.mock("fs", () => ({
    promises: {
        readFile: jest.fn(),
    },
}));

const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;

const SLUG = "add-login";

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
            status: "active",
            error: null,
        },
    ],
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
});

afterEach(() => {
    if (originalTargetAppPath === undefined) {
        delete process.env.TARGET_APP_PATH;
    } else {
        process.env.TARGET_APP_PATH = originalTargetAppPath;
    }
});

describe("getPipelineTelemetry", () => {
    it("returns parsed data for all three files (happy path)", async () => {
        mockReadFile.mockImplementation(async (filePath) => {
            const p = String(filePath);
            if (p.endsWith(`${SLUG}_STATE.json`)) return JSON.stringify(VALID_STATE);
            if (p.endsWith(`${SLUG}_FLIGHT_DATA.json`)) return JSON.stringify(VALID_FLIGHT_DATA);
            if (p.endsWith(`${SLUG}_CHANGES.json`)) return JSON.stringify(VALID_CHANGES);
            throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        });

        const telemetry = await getPipelineTelemetry(SLUG);

        expect(telemetry.state).toEqual(VALID_STATE);
        expect(telemetry.state.items[0].status).toBe("done");
        expect(telemetry.state.items[1].status).toBe("active");

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
        mockReadFile.mockRejectedValue(
            Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" }),
        );

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
            throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
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
        mockReadFile.mockRejectedValue(
            Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
        );

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
});

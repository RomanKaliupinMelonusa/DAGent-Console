import type {
    PipelineTelemetry,
    FlightData,
    ChangeManifest,
    ItemSummary,
} from "@/types/pipeline";

// ---------------------------------------------------------------------------
// Mock @github/copilot-sdk
// ---------------------------------------------------------------------------

const mockSendAndWait = jest.fn();
const mockDisconnect = jest.fn();
const mockCreateSession = jest.fn().mockResolvedValue({
    sendAndWait: mockSendAndWait,
    disconnect: mockDisconnect,
});
const mockStart = jest.fn();
const mockStop = jest.fn().mockResolvedValue([]);

jest.mock("@github/copilot-sdk", () => ({
    CopilotClient: jest.fn().mockImplementation(() => ({
        start: mockStart,
        createSession: mockCreateSession,
        stop: mockStop,
    })),
    approveAll: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock data service
// ---------------------------------------------------------------------------

const mockGetPipelineTelemetry = jest.fn();
const mockGetSpecMarkdown = jest.fn();

jest.mock("@/services/flightDataReader", () => ({
    getPipelineTelemetry: (...args: unknown[]) => mockGetPipelineTelemetry(...args),
    getSpecMarkdown: (...args: unknown[]) => mockGetSpecMarkdown(...args),
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/synthesis/[slug]/route";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const SLUG = "add-login";

function makeFlightItem(overrides: Partial<ItemSummary> & { key: string }): ItemSummary {
    return {
        label: overrides.key,
        agent: "test-agent",
        phase: "test",
        attempt: 1,
        startedAt: "2026-03-31T10:00:00Z",
        finishedAt: "2026-03-31T10:01:00Z",
        durationMs: 60000,
        outcome: "completed",
        intents: [],
        messages: [],
        filesRead: [],
        filesChanged: [],
        shellCommands: [],
        toolCounts: {},
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        ...overrides,
    };
}

const RICH_FLIGHT_DATA: FlightData = [
    makeFlightItem({
        key: "backend-dev",
        intents: ["scaffold-api", "write-tests"],
        toolCounts: { read_file: 15, write_file: 8, run_command: 5 },
        shellCommands: [
            { command: "npm test", timestamp: "2026-03-31T10:00:30Z", isPipelineOp: false },
            { command: "npm run build", timestamp: "2026-03-31T10:00:45Z", isPipelineOp: true },
        ],
        filesRead: ["src/api/index.ts", "src/api/routes.ts"],
        filesChanged: ["src/api/index.ts", "src/api/routes.ts", "src/api/handler.ts"],
        messages: ["API scaffold complete", "Tests written"],
        inputTokens: 5000,
        outputTokens: 2000,
    }),
    makeFlightItem({
        key: "frontend-dev",
        intents: ["build-ui"],
        toolCounts: { read_file: 10, write_file: 12 },
        errorMessage: "Component render failed on first attempt",
        shellCommands: [
            { command: "npx next build", timestamp: "2026-03-31T10:02:00Z", isPipelineOp: true },
        ],
        filesRead: ["src/app/page.tsx"],
        filesChanged: ["src/app/page.tsx", "src/components/Form.tsx"],
        messages: ["UI built with recovery"],
        inputTokens: 3000,
        outputTokens: 1500,
    }),
];

const VALID_CHANGES: ChangeManifest = {
    feature: "add-login",
    stepsCompleted: [
        { key: "backend-dev", agent: "coder", filesChanged: ["src/api/index.ts"], docNote: "Built API" },
    ],
    allFilesChanged: ["src/api/index.ts", "src/app/page.tsx"],
    summaryIntents: ["scaffold-api", "build-ui"],
};

const VALID_TELEMETRY: PipelineTelemetry = {
    state: {
        feature: "add-login",
        workflowType: "implement",
        started: "2026-03-31T10:00:00Z",
        deployedUrl: null,
        implementationNotes: null,
        items: [],
    },
    flightData: RICH_FLIGHT_DATA,
    changes: VALID_CHANGES,
};

const MOCK_SPEC = "# Add Login\n\nImplement OAuth login flow with GitHub provider.";

const MOCK_MARKDOWN =
    "The agent navigated the implementation with moderate friction...\n\n" +
    "A key turning point occurred during frontend development...\n\n" +
    "Overall, the autonomous pipeline successfully delivered the feature.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(): Request {
    return new Request("http://localhost:3000/api/synthesis/add-login", {
        method: "POST",
    });
}

function makeParams(): { params: Promise<{ slug: string }> } {
    return { params: Promise.resolve({ slug: SLUG }) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
    mockGetPipelineTelemetry.mockReset();
    mockGetSpecMarkdown.mockReset();
    mockSendAndWait.mockReset();
    mockDisconnect.mockReset();
    mockCreateSession.mockClear();
    mockStart.mockClear();
    mockStop.mockClear().mockResolvedValue([]);

    mockCreateSession.mockResolvedValue({
        sendAndWait: mockSendAndWait,
        disconnect: mockDisconnect,
    });
});

describe("POST /api/synthesis/[slug]", () => {
    it("returns 200 with markdown from the Copilot SDK (happy path)", async () => {
        mockGetPipelineTelemetry.mockResolvedValue(VALID_TELEMETRY);
        mockGetSpecMarkdown.mockResolvedValue(MOCK_SPEC);
        mockSendAndWait.mockResolvedValue({ data: { content: MOCK_MARKDOWN } });

        const response = await POST(makeRequest(), makeParams());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.markdown).toBe(MOCK_MARKDOWN);
    });

    it("creates a session with claude-opus-4.6 and replaced system prompt", async () => {
        mockGetPipelineTelemetry.mockResolvedValue(VALID_TELEMETRY);
        mockGetSpecMarkdown.mockResolvedValue(MOCK_SPEC);
        mockSendAndWait.mockResolvedValue({ data: { content: MOCK_MARKDOWN } });

        await POST(makeRequest(), makeParams());

        expect(mockCreateSession).toHaveBeenCalledWith(
            expect.objectContaining({
                model: "claude-opus-4.6",
                systemMessage: expect.objectContaining({
                    mode: "replace",
                }),
                infiniteSessions: { enabled: false },
            }),
        );

        const sessionConfig = mockCreateSession.mock.calls[0][0];
        expect(sessionConfig.systemMessage.content).toContain(
            "Engineering Director",
        );
        expect(sessionConfig.systemMessage.content).toContain(
            "3-paragraph executive post-mortem",
        );
    });

    it("compresses flight data — strips shellCommands, filesRead, filesChanged, messages, tokens", async () => {
        mockGetPipelineTelemetry.mockResolvedValue(VALID_TELEMETRY);
        mockGetSpecMarkdown.mockResolvedValue(MOCK_SPEC);
        mockSendAndWait.mockResolvedValue({ data: { content: MOCK_MARKDOWN } });

        await POST(makeRequest(), makeParams());

        const sentPrompt = mockSendAndWait.mock.calls[0][0].prompt as string;

        // The compressed flight data should contain keys, toolCounts, intents
        expect(sentPrompt).toContain("backend-dev");
        expect(sentPrompt).toContain("frontend-dev");
        expect(sentPrompt).toContain("scaffold-api");
        expect(sentPrompt).toContain("read_file");
        expect(sentPrompt).toContain("Component render failed on first attempt");

        // Raw shell commands and file lists must NOT appear in the prompt
        expect(sentPrompt).not.toContain("npm test");
        expect(sentPrompt).not.toContain("npx next build");
        expect(sentPrompt).not.toContain("src/api/routes.ts");
        expect(sentPrompt).not.toContain("src/components/Form.tsx");
        expect(sentPrompt).not.toContain("API scaffold complete");
    });

    it("includes the spec and changes in the user message", async () => {
        mockGetPipelineTelemetry.mockResolvedValue(VALID_TELEMETRY);
        mockGetSpecMarkdown.mockResolvedValue(MOCK_SPEC);
        mockSendAndWait.mockResolvedValue({ data: { content: MOCK_MARKDOWN } });

        await POST(makeRequest(), makeParams());

        const sentPrompt = mockSendAndWait.mock.calls[0][0].prompt as string;

        expect(sentPrompt).toContain("## SPEC");
        expect(sentPrompt).toContain("OAuth login flow");
        expect(sentPrompt).toContain("## CHANGES");
        expect(sentPrompt).toContain("scaffold-api");
    });

    it("cleans up the SDK client even on success", async () => {
        mockGetPipelineTelemetry.mockResolvedValue(VALID_TELEMETRY);
        mockGetSpecMarkdown.mockResolvedValue(MOCK_SPEC);
        mockSendAndWait.mockResolvedValue({ data: { content: MOCK_MARKDOWN } });

        await POST(makeRequest(), makeParams());

        expect(mockStart).toHaveBeenCalledTimes(1);
        expect(mockDisconnect).toHaveBeenCalledTimes(1);
        expect(mockStop).toHaveBeenCalledTimes(1);
    });

    it("returns 500 when the SDK throws", async () => {
        mockGetPipelineTelemetry.mockResolvedValue(VALID_TELEMETRY);
        mockGetSpecMarkdown.mockResolvedValue(MOCK_SPEC);
        mockSendAndWait.mockRejectedValue(new Error("SDK connection failed"));

        const response = await POST(makeRequest(), makeParams());
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body.error).toBe("Synthesis failed");
    });

    it("cleans up the SDK client on error", async () => {
        mockGetPipelineTelemetry.mockResolvedValue(VALID_TELEMETRY);
        mockGetSpecMarkdown.mockResolvedValue(MOCK_SPEC);
        mockSendAndWait.mockRejectedValue(new Error("SDK error"));

        await POST(makeRequest(), makeParams());

        expect(mockStop).toHaveBeenCalledTimes(1);
    });

    it("returns empty markdown when sendAndWait returns undefined", async () => {
        mockGetPipelineTelemetry.mockResolvedValue(VALID_TELEMETRY);
        mockGetSpecMarkdown.mockResolvedValue(MOCK_SPEC);
        mockSendAndWait.mockResolvedValue(undefined);

        const response = await POST(makeRequest(), makeParams());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.markdown).toBe("");
    });
});

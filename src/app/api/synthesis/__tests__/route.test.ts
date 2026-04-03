import type {
    PipelineTelemetry,
    FlightData,
    ChangeManifest,
    ItemSummary,
} from "@/types/pipeline";

// ---------------------------------------------------------------------------
// Mock @github/copilot-sdk — session uses sendAndWait()
// ---------------------------------------------------------------------------

const mockSendAndWait = jest.fn();
const mockDisconnect = jest.fn().mockResolvedValue(undefined);

function createMockSession() {
    return {
        sendAndWait: mockSendAndWait,
        disconnect: mockDisconnect,
    };
}

const mockSession = createMockSession();
const mockCreateSession = jest.fn().mockResolvedValue(mockSession);
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
        errorLog: [],
    },
    flightData: RICH_FLIGHT_DATA,
    changes: VALID_CHANGES,
};

const MOCK_SPEC = "# Add Login\n\nImplement OAuth login flow with GitHub provider.";

const MOCK_RESPONSE_CONTENT =
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

/** Read all SSE data events from a streaming response */
async function readSSEStream(response: Response): Promise<Array<Record<string, unknown>>> {
    const text = await response.text();
    return text
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => JSON.parse(line.slice(6)));
}

/** Make sendAndWait return a mock assistant message */
function mockAssistantResponse(content: string) {
    mockSendAndWait.mockResolvedValue({
        type: "assistant.message",
        data: { content, messageId: "m1" },
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
    mockGetPipelineTelemetry.mockReset();
    mockGetSpecMarkdown.mockReset();
    mockSendAndWait.mockReset();
    mockDisconnect.mockReset().mockResolvedValue(undefined);
    mockCreateSession.mockClear();
    mockStart.mockClear();
    mockStop.mockClear().mockResolvedValue([]);

    const session = createMockSession();
    Object.assign(mockSession, session);
    mockCreateSession.mockResolvedValue(session);
});

describe("POST /api/synthesis/[slug]", () => {
    it("streams markdown via SSE after sendAndWait (happy path)", async () => {
        mockGetPipelineTelemetry.mockResolvedValue(VALID_TELEMETRY);
        mockGetSpecMarkdown.mockResolvedValue(MOCK_SPEC);
        mockAssistantResponse(MOCK_RESPONSE_CONTENT);

        const response = await POST(makeRequest(), makeParams());
        const events = await readSSEStream(response);

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("text/event-stream");

        // Should have delta chunks + a final done event
        const deltas = events.filter((e) => e.delta);
        const doneEvents = events.filter((e) => e.done);
        expect(deltas.length).toBeGreaterThan(0);
        expect(doneEvents).toHaveLength(1);

        // Reassemble content from deltas
        const fullContent = deltas.map((e) => e.delta).join("");
        expect(fullContent).toBe(MOCK_RESPONSE_CONTENT);
    });

    it("creates a session with claude-opus-4.6 and replaced system prompt", async () => {
        mockGetPipelineTelemetry.mockResolvedValue(VALID_TELEMETRY);
        mockGetSpecMarkdown.mockResolvedValue(MOCK_SPEC);
        mockAssistantResponse("ok");

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
        expect(sessionConfig.systemMessage.content).toContain("Engineering Director");
        expect(sessionConfig.systemMessage.content).toContain("3-paragraph executive post-mortem");
    });

    it("compresses flight data — strips shellCommands, filesRead, filesChanged, messages, tokens", async () => {
        mockGetPipelineTelemetry.mockResolvedValue(VALID_TELEMETRY);
        mockGetSpecMarkdown.mockResolvedValue(MOCK_SPEC);
        mockAssistantResponse("ok");

        await POST(makeRequest(), makeParams());

        const sentPrompt = mockSendAndWait.mock.calls[0][0].prompt as string;

        expect(sentPrompt).toContain("backend-dev");
        expect(sentPrompt).toContain("scaffold-api");
        expect(sentPrompt).toContain("read_file");
        expect(sentPrompt).not.toContain("npm test");
        expect(sentPrompt).not.toContain("src/api/routes.ts");
    });

    it("includes the spec and changes in the user message", async () => {
        mockGetPipelineTelemetry.mockResolvedValue(VALID_TELEMETRY);
        mockGetSpecMarkdown.mockResolvedValue(MOCK_SPEC);
        mockAssistantResponse("ok");

        await POST(makeRequest(), makeParams());

        const sentPrompt = mockSendAndWait.mock.calls[0][0].prompt as string;
        expect(sentPrompt).toContain("## SPEC");
        expect(sentPrompt).toContain("OAuth login flow");
        expect(sentPrompt).toContain("## CHANGES");
    });

    it("returns 502 when sendAndWait returns empty content", async () => {
        mockGetPipelineTelemetry.mockResolvedValue(VALID_TELEMETRY);
        mockGetSpecMarkdown.mockResolvedValue(MOCK_SPEC);
        mockSendAndWait.mockResolvedValue(undefined);

        const response = await POST(makeRequest(), makeParams());
        const body = await response.json();

        expect(response.status).toBe(502);
        expect(body.error).toContain("empty response");
    });

    it("returns 500 when createSession throws", async () => {
        mockGetPipelineTelemetry.mockResolvedValue(VALID_TELEMETRY);
        mockGetSpecMarkdown.mockResolvedValue(MOCK_SPEC);
        mockCreateSession.mockRejectedValue(new Error("SDK connection failed"));

        const response = await POST(makeRequest(), makeParams());
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body.error).toContain("Synthesis failed");
    });

    it("cleans up the SDK client on pre-stream error", async () => {
        mockGetPipelineTelemetry.mockResolvedValue(VALID_TELEMETRY);
        mockGetSpecMarkdown.mockResolvedValue(MOCK_SPEC);
        mockCreateSession.mockRejectedValue(new Error("SDK error"));

        await POST(makeRequest(), makeParams());

        expect(mockStop).toHaveBeenCalledTimes(1);
    });
});

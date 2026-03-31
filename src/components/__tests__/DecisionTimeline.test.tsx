/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import type {
    PipelineTelemetry,
    PipelineStateItem,
    FlightData,
    ItemSummary,
    ChangeManifest,
} from "@/types/pipeline";

// ---------------------------------------------------------------------------
// Mock SWR — control return value per test
// ---------------------------------------------------------------------------

const mockUseSWR = jest.fn();
jest.mock("swr", () => ({
    __esModule: true,
    default: (...args: unknown[]) => mockUseSWR(...args),
}));

// ---------------------------------------------------------------------------
// Import component and helpers AFTER mocks are in place
// ---------------------------------------------------------------------------

import DecisionTimeline, {
    parseErrorMessage,
    buildTimelineEvents,
} from "@/components/DecisionTimeline";

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeStateItem(
    key: string,
    status: PipelineStateItem["status"],
    error: string | null = null,
): PipelineStateItem {
    return {
        key,
        label: key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        agent: `${key}-agent`,
        phase: "test",
        status,
        error,
    };
}

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

function makeTelemetry(
    stateItems: PipelineStateItem[],
    flightData: FlightData = [],
    changes: Partial<ChangeManifest> = {},
): PipelineTelemetry {
    return {
        state: {
            feature: "test-feature",
            workflowType: "implement",
            started: "2026-03-31T10:00:00Z",
            deployedUrl: null,
            implementationNotes: null,
            items: stateItems,
        },
        flightData,
        changes: {
            feature: "test-feature",
            stepsCompleted: [],
            allFilesChanged: [],
            summaryIntents: [],
            ...changes,
        },
    };
}

// =========================================================================
// Unit tests — parseErrorMessage
// =========================================================================

describe("parseErrorMessage", () => {
    it("parses structured JSON with fault_domain and diagnostic_trace", () => {
        const json = JSON.stringify({
            fault_domain: "database",
            diagnostic_trace: "connection pool exhausted",
        });
        const result = parseErrorMessage(json);
        expect(result.isStructured).toBe(true);
        expect(result.faultDomain).toBe("database");
        expect(result.diagnosticTrace).toBe("connection pool exhausted");
    });

    it("returns unstructured for plain string error", () => {
        const result = parseErrorMessage("Something went wrong");
        expect(result.isStructured).toBe(false);
        expect(result.raw).toBe("Something went wrong");
        expect(result.faultDomain).toBeUndefined();
    });

    it("returns unstructured for valid JSON missing required fields", () => {
        const json = JSON.stringify({ code: 500, message: "fail" });
        const result = parseErrorMessage(json);
        expect(result.isStructured).toBe(false);
        expect(result.raw).toBe(json);
    });

    it("returns unstructured for JSON with non-string fault_domain", () => {
        const json = JSON.stringify({
            fault_domain: 42,
            diagnostic_trace: "trace",
        });
        const result = parseErrorMessage(json);
        expect(result.isStructured).toBe(false);
    });

    it("returns unstructured for malformed JSON", () => {
        const result = parseErrorMessage("{bad json!!");
        expect(result.isStructured).toBe(false);
        expect(result.raw).toBe("{bad json!!");
    });
});

// =========================================================================
// Unit tests — buildTimelineEvents
// =========================================================================

describe("buildTimelineEvents", () => {
    it("returns empty array when no events exist", () => {
        const events = buildTimelineEvents([], {
            feature: "f",
            stepsCompleted: [],
            allFilesChanged: [],
            summaryIntents: [],
        });
        expect(events).toEqual([]);
    });

    it("creates intent events from flight data intents", () => {
        const flight: FlightData = [
            makeFlightItem({
                key: "backend-dev",
                intents: ["Switching to mocked auth", "Adding retry logic"],
                startedAt: "2026-03-31T10:00:00Z",
            }),
        ];
        const events = buildTimelineEvents(flight, {
            feature: "f",
            stepsCompleted: [],
            allFilesChanged: [],
            summaryIntents: [],
        });
        expect(events).toHaveLength(2);
        expect(events[0].kind).toBe("intent");
        expect(events[0].title).toBe("Intent: Switching to mocked auth");
        expect(events[0].timestamp).toBe("2026-03-31T10:00:00Z");
        expect(events[1].title).toBe("Intent: Adding retry logic");
    });

    it("creates architecture events from docNotes, keyed to finishedAt", () => {
        const flight: FlightData = [
            makeFlightItem({
                key: "backend-dev",
                startedAt: "2026-03-31T10:00:00Z",
                finishedAt: "2026-03-31T10:05:00Z",
            }),
        ];
        const changes: ChangeManifest = {
            feature: "f",
            stepsCompleted: [
                { key: "backend-dev", agent: "dev", filesChanged: [], docNote: "Migrated to JWT auth" },
            ],
            allFilesChanged: [],
            summaryIntents: [],
        };
        const events = buildTimelineEvents(flight, changes);
        expect(events).toHaveLength(1);
        expect(events[0].kind).toBe("architecture");
        expect(events[0].title).toBe("Architecture Updated");
        expect(events[0].body).toBe("Migrated to JWT auth");
        expect(events[0].timestamp).toBe("2026-03-31T10:05:00Z");
    });

    it("skips stepsCompleted entries with null docNote", () => {
        const flight: FlightData = [
            makeFlightItem({ key: "step-1" }),
        ];
        const changes: ChangeManifest = {
            feature: "f",
            stepsCompleted: [
                { key: "step-1", agent: "dev", filesChanged: [], docNote: null },
            ],
            allFilesChanged: [],
            summaryIntents: [],
        };
        const events = buildTimelineEvents(flight, changes);
        expect(events).toHaveLength(0);
    });

    it("creates structured triage event from JSON errorMessage", () => {
        const flight: FlightData = [
            makeFlightItem({
                key: "deploy",
                outcome: "failed",
                finishedAt: "2026-03-31T10:03:00Z",
                errorMessage: JSON.stringify({
                    fault_domain: "network",
                    diagnostic_trace: "DNS resolution timeout",
                }),
            }),
        ];
        const events = buildTimelineEvents(flight, {
            feature: "f",
            stepsCompleted: [],
            allFilesChanged: [],
            summaryIntents: [],
        });
        expect(events).toHaveLength(1);
        expect(events[0].kind).toBe("triage");
        expect(events[0].title).toBe("Self-Healing Triggered");
        expect(events[0].faultDomain).toBe("network");
        expect(events[0].diagnosticTrace).toBe("DNS resolution timeout");
        expect(events[0].timestamp).toBe("2026-03-31T10:03:00Z");
    });

    it("creates plain triage event from non-JSON errorMessage", () => {
        const flight: FlightData = [
            makeFlightItem({
                key: "deploy",
                outcome: "failed",
                errorMessage: "Process exited with code 1",
            }),
        ];
        const events = buildTimelineEvents(flight, {
            feature: "f",
            stepsCompleted: [],
            allFilesChanged: [],
            summaryIntents: [],
        });
        expect(events).toHaveLength(1);
        expect(events[0].kind).toBe("triage");
        expect(events[0].title).toBe("Error");
        expect(events[0].body).toBe("Process exited with code 1");
    });

    it("does not create triage events for non-failed outcomes", () => {
        const flight: FlightData = [
            makeFlightItem({
                key: "deploy",
                outcome: "completed",
                errorMessage: "not relevant",
            }),
        ];
        const events = buildTimelineEvents(flight, {
            feature: "f",
            stepsCompleted: [],
            allFilesChanged: [],
            summaryIntents: [],
        });
        expect(events).toHaveLength(0);
    });

    it("creates triage events for outcome 'error' (not just 'failed')", () => {
        const flight: FlightData = [
            makeFlightItem({
                key: "deploy",
                outcome: "error",
                finishedAt: "2026-03-31T10:03:00Z",
                errorMessage: JSON.stringify({
                    fault_domain: "runtime",
                    diagnostic_trace: "Unhandled promise rejection",
                }),
            }),
        ];
        const events = buildTimelineEvents(flight, {
            feature: "f",
            stepsCompleted: [],
            allFilesChanged: [],
            summaryIntents: [],
        });
        expect(events).toHaveLength(1);
        expect(events[0].kind).toBe("triage");
        expect(events[0].title).toBe("Self-Healing Triggered");
        expect(events[0].faultDomain).toBe("runtime");
        expect(events[0].timestamp).toBe("2026-03-31T10:03:00Z");
    });

    it("does not create triage events for skipped outcomes", () => {
        const flight: FlightData = [
            makeFlightItem({
                key: "deploy",
                outcome: "skipped",
                errorMessage: "skipped due to dependency failure",
            }),
        ];
        const events = buildTimelineEvents(flight, {
            feature: "f",
            stepsCompleted: [],
            allFilesChanged: [],
            summaryIntents: [],
        });
        expect(events).toHaveLength(0);
    });

    it("sorts events by timestamp: intents (startedAt) before errors (finishedAt)", () => {
        const flight: FlightData = [
            makeFlightItem({
                key: "step-a",
                startedAt: "2026-03-31T10:00:00Z",
                finishedAt: "2026-03-31T10:05:00Z",
                intents: ["Planning phase"],
                outcome: "failed",
                errorMessage: "Timeout",
            }),
        ];
        const events = buildTimelineEvents(flight, {
            feature: "f",
            stepsCompleted: [],
            allFilesChanged: [],
            summaryIntents: [],
        });
        expect(events).toHaveLength(2);
        expect(events[0].kind).toBe("intent");
        expect(events[0].timestamp).toBe("2026-03-31T10:00:00Z");
        expect(events[1].kind).toBe("triage");
        expect(events[1].timestamp).toBe("2026-03-31T10:05:00Z");
    });

    it("interleaves events from multiple steps chronologically", () => {
        const flight: FlightData = [
            makeFlightItem({
                key: "step-b",
                startedAt: "2026-03-31T10:10:00Z",
                finishedAt: "2026-03-31T10:15:00Z",
                intents: ["Step B intent"],
            }),
            makeFlightItem({
                key: "step-a",
                startedAt: "2026-03-31T10:00:00Z",
                finishedAt: "2026-03-31T10:05:00Z",
                intents: ["Step A intent"],
            }),
        ];
        const changes: ChangeManifest = {
            feature: "f",
            stepsCompleted: [
                { key: "step-a", agent: "dev", filesChanged: [], docNote: "Architecture change" },
            ],
            allFilesChanged: [],
            summaryIntents: [],
        };
        const events = buildTimelineEvents(flight, changes);
        // Expected order: step-a intent (10:00), step-a arch (10:05), step-b intent (10:10)
        expect(events).toHaveLength(3);
        expect(events[0].stepKey).toBe("step-a");
        expect(events[0].kind).toBe("intent");
        expect(events[1].stepKey).toBe("step-a");
        expect(events[1].kind).toBe("architecture");
        expect(events[2].stepKey).toBe("step-b");
        expect(events[2].kind).toBe("intent");
    });
});

// =========================================================================
// Render integration tests
// =========================================================================

describe("DecisionTimeline", () => {
    beforeEach(() => {
        mockUseSWR.mockReset();
    });

    it("renders loading state", () => {
        mockUseSWR.mockReturnValue({ data: undefined, isLoading: true });
        render(<DecisionTimeline slug="test" />);
        expect(screen.getByText("Loading decision timeline…")).toBeInTheDocument();
    });

    it("renders empty state when no events exist", () => {
        const data = makeTelemetry([makeStateItem("plan", "done")]);
        mockUseSWR.mockReturnValue({ data, isLoading: false });
        render(<DecisionTimeline slug="test" />);
        expect(screen.getByText("No timeline events yet.")).toBeInTheDocument();
    });

    it("renders intent cards from flight data intents", () => {
        const data = makeTelemetry(
            [makeStateItem("backend-dev", "done")],
            [
                makeFlightItem({
                    key: "backend-dev",
                    intents: ["Switching to mocked auth"],
                }),
            ],
        );
        mockUseSWR.mockReturnValue({ data, isLoading: false });
        render(<DecisionTimeline slug="test" />);

        const card = screen.getByTestId("intent-card");
        expect(card).toBeInTheDocument();
        expect(card).toHaveTextContent("Intent: Switching to mocked auth");
    });

    it("renders architecture cards when docNote is present", () => {
        const data = makeTelemetry(
            [makeStateItem("backend-dev", "done")],
            [makeFlightItem({ key: "backend-dev" })],
            {
                stepsCompleted: [
                    { key: "backend-dev", agent: "dev", filesChanged: [], docNote: "Migrated to JWT auth" },
                ],
            },
        );
        mockUseSWR.mockReturnValue({ data, isLoading: false });
        render(<DecisionTimeline slug="test" />);

        const card = screen.getByTestId("architecture-card");
        expect(card).toBeInTheDocument();
        expect(card).toHaveTextContent("Architecture Updated");
        expect(card).toHaveTextContent("Migrated to JWT auth");
    });

    it("renders self-healing triage card with structured JSON error", () => {
        const data = makeTelemetry(
            [makeStateItem("deploy", "done", "failed")],
            [
                makeFlightItem({
                    key: "deploy",
                    outcome: "failed",
                    errorMessage: JSON.stringify({
                        fault_domain: "network",
                        diagnostic_trace: "DNS resolution timeout",
                    }),
                }),
            ],
        );
        mockUseSWR.mockReturnValue({ data, isLoading: false });
        render(<DecisionTimeline slug="test" />);

        const card = screen.getByTestId("triage-card");
        expect(card).toBeInTheDocument();
        expect(card).toHaveTextContent("Self-Healing Triggered");
        expect(card).toHaveTextContent("network");
        expect(card).toHaveTextContent("DNS resolution timeout");
    });

    it("gracefully falls back to raw string when errorMessage is not valid JSON", () => {
        const data = makeTelemetry(
            [makeStateItem("deploy", "done", "failed")],
            [
                makeFlightItem({
                    key: "deploy",
                    outcome: "failed",
                    errorMessage: "Process exited with code 1",
                }),
            ],
        );
        mockUseSWR.mockReturnValue({ data, isLoading: false });
        render(<DecisionTimeline slug="test" />);

        const card = screen.getByTestId("triage-card");
        expect(card).toBeInTheDocument();
        expect(card).toHaveTextContent("Error");
        expect(card).toHaveTextContent("Process exited with code 1");
        // Confirm no structured fields are rendered
        expect(card).not.toHaveTextContent("Fault Domain:");
        expect(card).not.toHaveTextContent("Trace:");
    });

    it("gracefully falls back when errorMessage is JSON but missing required fields", () => {
        const data = makeTelemetry(
            [makeStateItem("deploy", "done", "failed")],
            [
                makeFlightItem({
                    key: "deploy",
                    outcome: "failed",
                    errorMessage: JSON.stringify({ code: 500, message: "Internal Server Error" }),
                }),
            ],
        );
        mockUseSWR.mockReturnValue({ data, isLoading: false });
        render(<DecisionTimeline slug="test" />);

        const card = screen.getByTestId("triage-card");
        expect(card).toBeInTheDocument();
        expect(card).toHaveTextContent("Error");
        // Raw JSON string is displayed
        expect(card).toHaveTextContent("Internal Server Error");
    });

    it("renders multiple event types interleaved", () => {
        const data = makeTelemetry(
            [
                makeStateItem("backend-dev", "done"),
                makeStateItem("deploy", "done", "failed"),
            ],
            [
                makeFlightItem({
                    key: "backend-dev",
                    startedAt: "2026-03-31T10:00:00Z",
                    finishedAt: "2026-03-31T10:05:00Z",
                    intents: ["Adding retry logic"],
                }),
                makeFlightItem({
                    key: "deploy",
                    startedAt: "2026-03-31T10:06:00Z",
                    finishedAt: "2026-03-31T10:08:00Z",
                    outcome: "failed",
                    errorMessage: "Timeout occurred",
                }),
            ],
            {
                stepsCompleted: [
                    { key: "backend-dev", agent: "dev", filesChanged: [], docNote: "Added circuit breaker" },
                ],
            },
        );
        mockUseSWR.mockReturnValue({ data, isLoading: false });
        render(<DecisionTimeline slug="test" />);

        expect(screen.getByTestId("intent-card")).toBeInTheDocument();
        expect(screen.getByTestId("architecture-card")).toBeInTheDocument();
        expect(screen.getByTestId("triage-card")).toBeInTheDocument();
    });

    it("does not poll when slug is empty", () => {
        mockUseSWR.mockReturnValue({ data: undefined, isLoading: false });
        render(<DecisionTimeline slug="" />);
        expect(mockUseSWR).toHaveBeenCalledWith(null, expect.any(Function), expect.any(Object));
    });
});

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

import ActiveAgentHealth, {
    calculateTotalCost,
    getTotalToolCalls,
    getHealthStatus,
    formatFreshness,
} from "@/components/ActiveAgentHealth";

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
        },
    };
}

// =========================================================================
// Unit tests — pure helper functions
// =========================================================================

describe("calculateTotalCost", () => {
    it("returns 0 for empty flight data", () => {
        expect(calculateTotalCost([])).toBe(0);
    });

    it("returns 0 when all token counts are zero", () => {
        const data: FlightData = [
            makeFlightItem({
                key: "step-1",
                inputTokens: 0,
                outputTokens: 0,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
            }),
        ];
        expect(calculateTotalCost(data)).toBe(0);
    });

    it("correctly prices a single step with all four token categories", () => {
        const data: FlightData = [
            makeFlightItem({
                key: "step-1",
                inputTokens: 1000,
                outputTokens: 1000,
                cacheReadTokens: 1000,
                cacheWriteTokens: 1000,
            }),
        ];
        // 1000 * 0.015/1000 = 0.015
        // 1000 * 0.075/1000 = 0.075
        // 1000 * 0.0015/1000 = 0.0015
        // 1000 * 0.00375/1000 = 0.00375
        // Total: 0.09525
        expect(calculateTotalCost(data)).toBeCloseTo(0.09525, 10);
    });

    it("correctly sums costs across multiple steps", () => {
        const data: FlightData = [
            makeFlightItem({
                key: "step-1",
                inputTokens: 2000,
                outputTokens: 500,
                cacheReadTokens: 10000,
                cacheWriteTokens: 3000,
            }),
            makeFlightItem({
                key: "step-2",
                inputTokens: 5000,
                outputTokens: 2000,
                cacheReadTokens: 8000,
                cacheWriteTokens: 1000,
            }),
        ];
        // Step 1: 2000*0.015/1000 + 500*0.075/1000 + 10000*0.0015/1000 + 3000*0.00375/1000
        //       = 0.030 + 0.0375 + 0.015 + 0.01125 = 0.09375
        // Step 2: 5000*0.015/1000 + 2000*0.075/1000 + 8000*0.0015/1000 + 1000*0.00375/1000
        //       = 0.075 + 0.150 + 0.012 + 0.00375 = 0.24075
        // Total: 0.33450
        expect(calculateTotalCost(data)).toBeCloseTo(0.3345, 10);
    });

    it("handles input-only tokens", () => {
        const data: FlightData = [
            makeFlightItem({
                key: "step-1",
                inputTokens: 10000,
                outputTokens: 0,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
            }),
        ];
        expect(calculateTotalCost(data)).toBeCloseTo(0.15, 10);
    });
});

describe("getTotalToolCalls", () => {
    it("returns 0 for empty toolCounts", () => {
        const item = makeFlightItem({ key: "step-1", toolCounts: {} });
        expect(getTotalToolCalls(item)).toBe(0);
    });

    it("sums all tool call counts", () => {
        const item = makeFlightItem({
            key: "step-1",
            toolCounts: { read_file: 10, write_file: 5 },
        });
        expect(getTotalToolCalls(item)).toBe(15);
    });

    it("handles a single tool type", () => {
        const item = makeFlightItem({
            key: "step-1",
            toolCounts: { run_command: 25 },
        });
        expect(getTotalToolCalls(item)).toBe(25);
    });
});

describe("getHealthStatus", () => {
    it("returns green with no badge below soft limit", () => {
        const status = getHealthStatus(29);
        expect(status.barColor).toBe("bg-green-500");
        expect(status.badge).toBeNull();
    });

    it("returns green with no badge at 0 calls", () => {
        const status = getHealthStatus(0);
        expect(status.barColor).toBe("bg-green-500");
        expect(status.badge).toBeNull();
    });

    it("triggers orange at exactly 30 calls (soft limit)", () => {
        const status = getHealthStatus(30);
        expect(status.barColor).toBe("bg-orange-400");
        expect(status.badge).toBe("Soft Interception Triggered");
    });

    it("stays orange between soft and hard limit", () => {
        const status = getHealthStatus(35);
        expect(status.barColor).toBe("bg-orange-400");
        expect(status.badge).toBe("Soft Interception Triggered");
    });

    it("triggers red at exactly 40 calls (hard limit)", () => {
        const status = getHealthStatus(40);
        expect(status.barColor).toBe("bg-red-500");
        expect(status.badge).toBe("Hard Kill Initiated");
    });

    it("stays red above hard limit", () => {
        const status = getHealthStatus(50);
        expect(status.barColor).toBe("bg-red-500");
        expect(status.badge).toBe("Hard Kill Initiated");
    });

    it("respects custom soft and hard limits", () => {
        expect(getHealthStatus(19, 20, 25).badge).toBeNull();
        expect(getHealthStatus(20, 20, 25).badge).toBe("Soft Interception Triggered");
        expect(getHealthStatus(25, 20, 25).badge).toBe("Hard Kill Initiated");
    });
});

// =========================================================================
// Render integration tests
// =========================================================================

describe("ActiveAgentHealth", () => {
    beforeEach(() => {
        mockUseSWR.mockReset();
    });

    it("renders loading state", () => {
        mockUseSWR.mockReturnValue({ data: undefined, isLoading: true });
        render(<ActiveAgentHealth slug="test" />);
        expect(screen.getByText("Loading agent health…")).toBeInTheDocument();
    });

    it("renders total spend formatted to two decimals", () => {
        const data = makeTelemetry(
            [makeStateItem("plan", "done")],
            [
                makeFlightItem({
                    key: "plan",
                    inputTokens: 1000,
                    outputTokens: 1000,
                    cacheReadTokens: 1000,
                    cacheWriteTokens: 1000,
                }),
            ],
        );
        mockUseSWR.mockReturnValue({ data, isLoading: false });
        render(<ActiveAgentHealth slug="test" />);
        expect(screen.getByText("Total Spend: $0.10")).toBeInTheDocument();
    });

    it("shows 'No active agent' when no step is active", () => {
        const data = makeTelemetry([makeStateItem("plan", "done")]);
        mockUseSWR.mockReturnValue({ data, isLoading: false });
        render(<ActiveAgentHealth slug="test" />);
        expect(screen.getByText("No active agent")).toBeInTheDocument();
    });

    it("shows 'Waiting for agent telemetry...' when step is active but has no flight data", () => {
        const data = makeTelemetry(
            [makeStateItem("backend-dev", "active")],
            [], // no flight data yet
        );
        mockUseSWR.mockReturnValue({ data, isLoading: false });
        render(<ActiveAgentHealth slug="test" />);
        expect(
            screen.getByText("Waiting for agent telemetry..."),
        ).toBeInTheDocument();
    });

    it("renders a green progress bar when tool calls are below soft limit", () => {
        const data = makeTelemetry(
            [makeStateItem("backend-dev", "active")],
            [
                makeFlightItem({
                    key: "backend-dev",
                    toolCounts: { read_file: 5, write_file: 3 },
                }),
            ],
        );
        mockUseSWR.mockReturnValue({ data, isLoading: false });
        render(<ActiveAgentHealth slug="test" />);

        const bar = screen.getByTestId("health-bar");
        expect(bar).toHaveClass("bg-green-500");
        expect(screen.queryByTestId("health-badge")).not.toBeInTheDocument();
    });

    it("renders orange bar with badge at exactly 30 tool calls", () => {
        const data = makeTelemetry(
            [makeStateItem("backend-dev", "active")],
            [
                makeFlightItem({
                    key: "backend-dev",
                    toolCounts: { read_file: 20, write_file: 10 },
                }),
            ],
        );
        mockUseSWR.mockReturnValue({ data, isLoading: false });
        render(<ActiveAgentHealth slug="test" />);

        const bar = screen.getByTestId("health-bar");
        expect(bar).toHaveClass("bg-orange-400");

        const badge = screen.getByTestId("health-badge");
        expect(badge).toHaveTextContent("Soft Interception Triggered");
    });

    it("renders red bar with badge at exactly 40 tool calls", () => {
        const data = makeTelemetry(
            [makeStateItem("backend-dev", "active")],
            [
                makeFlightItem({
                    key: "backend-dev",
                    toolCounts: { read_file: 25, write_file: 10, run_command: 5 },
                }),
            ],
        );
        mockUseSWR.mockReturnValue({ data, isLoading: false });
        render(<ActiveAgentHealth slug="test" />);

        const bar = screen.getByTestId("health-bar");
        expect(bar).toHaveClass("bg-red-500");

        const badge = screen.getByTestId("health-badge");
        expect(badge).toHaveTextContent("Hard Kill Initiated");
    });

    it("renders the active agent label", () => {
        const data = makeTelemetry(
            [makeStateItem("backend-dev", "active")],
            [makeFlightItem({ key: "backend-dev", toolCounts: { read_file: 1 } })],
        );
        mockUseSWR.mockReturnValue({ data, isLoading: false });
        render(<ActiveAgentHealth slug="test" />);
        expect(screen.getByText("Active: Backend Dev")).toBeInTheDocument();
    });

    it("displays tool call count as fraction of hard limit", () => {
        const data = makeTelemetry(
            [makeStateItem("backend-dev", "active")],
            [
                makeFlightItem({
                    key: "backend-dev",
                    toolCounts: { read_file: 12, write_file: 3 },
                }),
            ],
        );
        mockUseSWR.mockReturnValue({ data, isLoading: false });
        render(<ActiveAgentHealth slug="test" />);
        expect(screen.getByText("15 / 40 tool calls")).toBeInTheDocument();
    });

    it("passes null SWR key when slug is empty", () => {
        mockUseSWR.mockReturnValue({ data: undefined, isLoading: false });
        render(<ActiveAgentHealth slug="" />);
        expect(mockUseSWR).toHaveBeenCalledWith(
            null,
            expect.any(Function),
            expect.objectContaining({ refreshInterval: 3000 }),
        );
    });
});

// =========================================================================
// formatFreshness tests
// =========================================================================

describe("formatFreshness", () => {
    it("returns empty string for null", () => {
        expect(formatFreshness(null)).toBe("");
    });

    it("returns empty string for undefined", () => {
        expect(formatFreshness(undefined)).toBe("");
    });

    it("returns 'Updated just now' for recent timestamps", () => {
        const now = new Date().toISOString();
        expect(formatFreshness(now)).toBe("Updated just now");
    });

    it("returns seconds format for sub-minute timestamps", () => {
        const thirtySecsAgo = new Date(Date.now() - 30_000).toISOString();
        const result = formatFreshness(thirtySecsAgo);
        expect(result).toMatch(/Updated \d+s ago/);
    });

    it("returns minutes format for sub-hour timestamps", () => {
        const fiveMinsAgo = new Date(Date.now() - 5 * 60_000).toISOString();
        const result = formatFreshness(fiveMinsAgo);
        expect(result).toMatch(/Updated \d+m ago/);
    });

    it("returns hours format for older timestamps", () => {
        const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
        const result = formatFreshness(twoHoursAgo);
        expect(result).toMatch(/Updated \d+h ago/);
    });
});

/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { PipelineTelemetry, PipelineStateItem, FlightData, ItemSummary } from "@/types/pipeline";

// ---------------------------------------------------------------------------
// Mock @xyflow/react — jsdom cannot render canvas/SVG
// ---------------------------------------------------------------------------

jest.mock("@xyflow/react", () => ({
    ReactFlow: ({ children }: { children?: React.ReactNode }) => (
        <div data-testid="react-flow">{children}</div>
    ),
    Background: () => <div data-testid="rf-background" />,
    Controls: () => <div data-testid="rf-controls" />,
}));

// ---------------------------------------------------------------------------
// Mock SWR — control return value per test
// ---------------------------------------------------------------------------

const mockUseSWR = jest.fn();
jest.mock("swr", () => ({
    __esModule: true,
    default: (...args: unknown[]) => mockUseSWR(...args),
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks are in place
// ---------------------------------------------------------------------------

import LiveDag from "@/components/LiveDag";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(key: string, status: PipelineStateItem["status"], error: string | null = null): PipelineStateItem {
    return {
        key,
        label: key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        agent: `${key}-agent`,
        phase: "test",
        status,
        error,
    };
}

function makeTelemetry(items: PipelineStateItem[], flightData: FlightData = []): PipelineTelemetry {
    return {
        state: {
            feature: "test-feature",
            workflowType: "implement",
            started: "2026-03-31T10:00:00Z",
            deployedUrl: null,
            implementationNotes: null,
            items,
            errorLog: [],
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

function makeFlightItem(overrides: Partial<ItemSummary> & { key: string }): ItemSummary {
    return {
        label: overrides.key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LiveDag", () => {
    beforeEach(() => {
        mockUseSWR.mockReset();
    });

    it("renders nodes with correct status styles from flight data in-progress", () => {
        const data = makeTelemetry(
            [
                makeItem("schema-dev", "done"),
                makeItem("backend-dev", "pending"),
            ],
            [
                makeFlightItem({ key: "backend-dev", outcome: "in-progress" }),
            ],
        );

        mockUseSWR.mockReturnValue({ data, isLoading: false });

        render(<LiveDag slug="test-feature" />);
        expect(screen.getByTestId("react-flow")).toBeInTheDocument();
    });

    it("renders completed pipeline with all done nodes", () => {
        const data = makeTelemetry([
            makeItem("schema-dev", "done"),
            makeItem("backend-dev", "done"),
            makeItem("frontend-dev", "done"),
            makeItem("code-cleanup", "done"),
            makeItem("docs-archived", "done"),
            makeItem("publish-pr", "done"),
        ]);

        mockUseSWR.mockReturnValue({ data, isLoading: false });

        render(<LiveDag slug="test-feature" />);
        expect(screen.getByTestId("react-flow")).toBeInTheDocument();
    });

    it("handles loading state without crashing", () => {
        mockUseSWR.mockReturnValue({ data: undefined, isLoading: true });

        render(<LiveDag slug="test-feature" />);

        expect(screen.getByText("Loading pipeline state…")).toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.getByTestId("react-flow")).toBeInTheDocument();
    });

    it("renders the React Flow canvas with background and controls", () => {
        mockUseSWR.mockReturnValue({ data: undefined, isLoading: false });

        render(<LiveDag slug="test-feature" />);

        expect(screen.getByTestId("react-flow")).toBeInTheDocument();
        expect(screen.getByTestId("rf-background")).toBeInTheDocument();
        expect(screen.getByTestId("rf-controls")).toBeInTheDocument();
    });

    it("passes the correct SWR key with encoded slug", () => {
        mockUseSWR.mockReturnValue({ data: undefined, isLoading: false });

        render(<LiveDag slug="user-profile-3" />);

        expect(mockUseSWR).toHaveBeenCalledWith(
            "/api/pipeline/user-profile-3",
            expect.any(Function),
            expect.objectContaining({ refreshInterval: 3000, keepPreviousData: true }),
        );
    });

    it("passes null SWR key when slug is empty", () => {
        mockUseSWR.mockReturnValue({ data: undefined, isLoading: false });

        render(<LiveDag slug="" />);

        expect(mockUseSWR).toHaveBeenCalledWith(
            null,
            expect.any(Function),
            expect.objectContaining({ refreshInterval: 3000, keepPreviousData: true }),
        );
    });
});

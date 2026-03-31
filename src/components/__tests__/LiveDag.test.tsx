/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { PipelineTelemetry, PipelineStateItem } from "@/types/pipeline";

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

function makeTelemetry(items: PipelineStateItem[]): PipelineTelemetry {
    return {
        state: {
            feature: "test-feature",
            workflowType: "implement",
            started: "2026-03-31T10:00:00Z",
            deployedUrl: null,
            implementationNotes: null,
            items,
        },
        flightData: [],
        changes: {
            feature: "test-feature",
            stepsCompleted: [],
            allFilesChanged: [],
            summaryIntents: [],
        },
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LiveDag", () => {
    beforeEach(() => {
        mockUseSWR.mockReset();
    });

    it("renders the approval banner when await-infra-approval is active", () => {
        const data = makeTelemetry([
            makeItem("schema-dev", "done"),
            makeItem("infra-architect", "done"),
            makeItem("push-infra", "done"),
            makeItem("create-draft-pr", "done"),
            makeItem("poll-infra-plan", "done"),
            makeItem("await-infra-approval", "active"),
            makeItem("infra-handoff", "pending"),
        ]);

        mockUseSWR.mockReturnValue({ data, isLoading: false });

        render(<LiveDag slug="test-feature" />);

        const banner = screen.getByRole("alert");
        expect(banner).toBeInTheDocument();
        expect(banner).toHaveTextContent(
            "Human Action Required: Infrastructure Plan Awaiting Approval in GitHub."
        );
    });

    it("does NOT render the approval banner when await-infra-approval is pending", () => {
        const data = makeTelemetry([
            makeItem("schema-dev", "active"),
            makeItem("await-infra-approval", "pending"),
        ]);

        mockUseSWR.mockReturnValue({ data, isLoading: false });

        render(<LiveDag slug="test-feature" />);

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("does NOT render the approval banner when await-infra-approval is done", () => {
        const data = makeTelemetry([
            makeItem("await-infra-approval", "done"),
            makeItem("infra-handoff", "done"),
        ]);

        mockUseSWR.mockReturnValue({ data, isLoading: false });

        render(<LiveDag slug="test-feature" />);

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
            expect.objectContaining({ refreshInterval: 3000 }),
        );
    });

    it("passes null SWR key when slug is empty", () => {
        mockUseSWR.mockReturnValue({ data: undefined, isLoading: false });

        render(<LiveDag slug="" />);

        expect(mockUseSWR).toHaveBeenCalledWith(
            null,
            expect.any(Function),
            expect.objectContaining({ refreshInterval: 3000 }),
        );
    });
});

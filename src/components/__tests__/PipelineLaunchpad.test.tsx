/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { PipelineSummary } from "@/types/pipeline";

// ---------------------------------------------------------------------------
// Mock SWR
// ---------------------------------------------------------------------------

const mockUseSWR = jest.fn();
jest.mock("swr", () => ({
    __esModule: true,
    default: (...args: unknown[]) => mockUseSWR(...args),
}));

import PipelineLaunchpad from "@/components/PipelineLaunchpad";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function makePipelineSummary(
    overrides: Partial<PipelineSummary> & { slug: string },
): PipelineSummary {
    return {
        feature: overrides.slug,
        workflowType: "implement",
        started: "2026-03-31T10:00:00Z",
        overallStatus: "active",
        lastActivity: "2026-03-31T10:05:00Z",
        totalCost: 0.25,
        activeStep: null,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PipelineLaunchpad", () => {
    beforeEach(() => {
        mockUseSWR.mockReset();
    });

    it("renders loading skeleton", () => {
        mockUseSWR.mockReturnValue({ data: undefined, isLoading: true });
        render(<PipelineLaunchpad />);
        // Skeleton divs should be present (no text content)
        expect(screen.queryByText("Pipeline Launchpad")).not.toBeInTheDocument();
    });

    it("renders empty state when no pipelines found", () => {
        mockUseSWR.mockReturnValue({ data: [], isLoading: false });
        render(<PipelineLaunchpad />);
        expect(screen.getByText(/No pipelines found/)).toBeInTheDocument();
    });

    it("renders pipeline cards with correct details", () => {
        const pipelines: PipelineSummary[] = [
            makePipelineSummary({
                slug: "user-profile",
                feature: "User Profile Page",
                overallStatus: "active",
                activeStep: "Backend Development",
                totalCost: 1.23,
            }),
            makePipelineSummary({
                slug: "login-flow",
                feature: "Login Flow",
                overallStatus: "completed",
                totalCost: 0.5,
            }),
        ];
        mockUseSWR.mockReturnValue({ data: pipelines, isLoading: false });
        render(<PipelineLaunchpad />);

        expect(screen.getByText("Pipeline Launchpad")).toBeInTheDocument();
        expect(screen.getByText("2 pipelines discovered")).toBeInTheDocument();

        // Cards
        expect(screen.getByText("User Profile Page")).toBeInTheDocument();
        expect(screen.getByText("Login Flow")).toBeInTheDocument();

        // Active step shown
        expect(screen.getByText("Backend Development")).toBeInTheDocument();

        // Cost
        expect(screen.getByText("$1.23")).toBeInTheDocument();
        expect(screen.getByText("$0.50")).toBeInTheDocument();

        // Status badges
        expect(screen.getByText("Active")).toBeInTheDocument();
        expect(screen.getByText("Completed")).toBeInTheDocument();
    });

    it("links pipeline cards to the correct dashboard URL", () => {
        const pipelines: PipelineSummary[] = [
            makePipelineSummary({ slug: "my-feature" }),
        ];
        mockUseSWR.mockReturnValue({ data: pipelines, isLoading: false });
        render(<PipelineLaunchpad />);

        const card = screen.getByTestId("pipeline-card");
        expect(card).toHaveAttribute("href", "?pipeline=my-feature");
    });

    it("uses 5-second refresh interval", () => {
        mockUseSWR.mockReturnValue({ data: [], isLoading: false });
        render(<PipelineLaunchpad />);

        expect(mockUseSWR).toHaveBeenCalledWith(
            "/api/pipelines",
            expect.any(Function),
            { refreshInterval: 5000 },
        );
    });

    it("renders singular text for 1 pipeline", () => {
        const pipelines: PipelineSummary[] = [
            makePipelineSummary({ slug: "only-one" }),
        ];
        mockUseSWR.mockReturnValue({ data: pipelines, isLoading: false });
        render(<PipelineLaunchpad />);
        expect(screen.getByText("1 pipeline discovered")).toBeInTheDocument();
    });
});

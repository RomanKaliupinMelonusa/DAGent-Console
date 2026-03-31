import type { PipelineSummary } from "@/types/pipeline";

// ---------------------------------------------------------------------------
// Mock data service
// ---------------------------------------------------------------------------

const mockListPipelines = jest.fn();

jest.mock("@/services/flightDataReader", () => ({
    listPipelines: (...args: unknown[]) => mockListPipelines(...args),
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks
// ---------------------------------------------------------------------------

import { GET } from "@/app/api/pipelines/route";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/pipelines", () => {
    beforeEach(() => {
        mockListPipelines.mockReset();
    });

    it("returns pipeline summaries as JSON", async () => {
        const summaries: PipelineSummary[] = [
            {
                slug: "feature-a",
                feature: "Feature A",
                workflowType: "implement",
                started: "2026-03-31T10:00:00Z",
                overallStatus: "active",
                lastActivity: "2026-03-31T10:05:00Z",
                totalCost: 0.5,
                activeStep: "Coding",
            },
        ];
        mockListPipelines.mockResolvedValue(summaries);

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual(summaries);
    });

    it("returns empty array when no pipelines found", async () => {
        mockListPipelines.mockResolvedValue([]);

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual([]);
    });

    it("returns empty array on service error (graceful degradation)", async () => {
        mockListPipelines.mockRejectedValue(new Error("disk failure"));

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual([]);
    });
});

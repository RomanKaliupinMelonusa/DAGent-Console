export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { CopilotClient, approveAll } from "@github/copilot-sdk";
import { getPipelineTelemetry, getSpecMarkdown } from "@/services/flightDataReader";
import { compressFlightData } from "@/services/synthesisHelpers";

const SYSTEM_PROMPT =
    "You are an Engineering Director analyzing an autonomous agent's execution logs. " +
    "Compare the original SPEC against the FLIGHT_DATA and the CHANGES. " +
    "Do not summarize the code line-by-line. Instead, summarize the Agentic Journey: " +
    "1. Where did the agent experience friction (high tool counts, errors)? " +
    "2. What logical turning points occurred (triage loops, self-healing)? " +
    "3. Did the agent successfully bypass any framework bugs? " +
    "Output a 3-paragraph executive post-mortem.";

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ slug: string }> },
) {
    let client: CopilotClient | null = null;
    try {
        const { slug } = await params;

        const [telemetry, spec] = await Promise.all([
            getPipelineTelemetry(slug),
            getSpecMarkdown(slug),
        ]);

        const compressedFlight = compressFlightData(telemetry.flightData);

        const userMessage = [
            "## SPEC",
            spec,
            "",
            "## FLIGHT_DATA (compressed)",
            compressedFlight,
            "",
            "## CHANGES",
            JSON.stringify(telemetry.changes),
        ].join("\n");

        client = new CopilotClient();
        await client.start();

        const session = await client.createSession({
            model: "claude-opus-4.6",
            systemMessage: {
                mode: "replace",
                content: SYSTEM_PROMPT,
            },
            onPermissionRequest: approveAll,
            infiniteSessions: { enabled: false },
        });

        const response = await session.sendAndWait({ prompt: userMessage });

        await session.disconnect();

        const markdown = response?.data?.content ?? "";

        return NextResponse.json({ markdown });
    } catch {
        return NextResponse.json(
            { error: "Synthesis failed" },
            { status: 500 },
        );
    } finally {
        if (client) {
            await client.stop().catch(() => { });
        }
    }
}

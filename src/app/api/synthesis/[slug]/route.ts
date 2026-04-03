export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import path from "path";
import { CopilotClient, approveAll } from "@github/copilot-sdk";
import { getPipelineTelemetry, getSpecMarkdown } from "@/services/flightDataReader";
import { compressFlightData } from "@/services/synthesisHelpers";

// Resolve the CLI path at module load time so Turbopack's cwd doesn't matter
const CLI_PATH = path.join(
    process.cwd(),
    "node_modules",
    "@github",
    "copilot",
    "npm-loader.js",
);

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

        client = new CopilotClient({ cliPath: CLI_PATH });
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

        // Use sendAndWait — the SDK's reliable request/response API
        const response = await session.sendAndWait(
            { prompt: userMessage },
            120_000, // 2 min timeout
        );

        const content = response?.data?.content ?? "";

        // Clean up SDK resources
        await session.disconnect().catch(() => { });
        await client.stop().catch(() => { });
        client = null;

        if (!content) {
            return NextResponse.json(
                { error: "Synthesis returned empty response" },
                { status: 502 },
            );
        }

        // Stream the content as SSE chunks for progressive rendering
        const encoder = new TextEncoder();
        const CHUNK_SIZE = 80;
        const stream = new ReadableStream({
            start(controller) {
                let offset = 0;
                const interval = setInterval(() => {
                    if (offset >= content.length) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
                        controller.close();
                        clearInterval(interval);
                        return;
                    }
                    const chunk = content.slice(offset, offset + CHUNK_SIZE);
                    offset += CHUNK_SIZE;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`));
                }, 20);
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            },
        });
    } catch (err) {
        console.error("[synthesis] Error:", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        const isAuthError = message.includes("authentication") || message.includes("auth");
        return NextResponse.json(
            {
                error: isAuthError
                    ? "GitHub Copilot authentication required. Run `gh auth login` or set GITHUB_TOKEN."
                    : `Synthesis failed: ${message}`,
            },
            { status: isAuthError ? 401 : 500 },
        );
    } finally {
        if (client) {
            await client.stop().catch(() => { });
        }
    }
}

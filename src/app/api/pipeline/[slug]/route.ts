import { NextResponse } from "next/server";
import { getPipelineTelemetry, getFlightDataMtime } from "@/services/flightDataReader";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const [telemetry, lastModified] = await Promise.all([
            getPipelineTelemetry(slug),
            getFlightDataMtime(slug),
        ]);
        return NextResponse.json({ ...telemetry, lastModified });
    } catch {
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}

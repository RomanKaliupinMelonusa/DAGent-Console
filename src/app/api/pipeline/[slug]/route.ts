import { NextResponse } from "next/server";
import { getPipelineTelemetry } from "@/services/flightDataReader";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const telemetry = await getPipelineTelemetry(slug);
        return NextResponse.json(telemetry);
    } catch {
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}

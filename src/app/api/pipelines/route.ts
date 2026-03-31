import { NextResponse } from "next/server";
import { listPipelines } from "@/services/flightDataReader";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const pipelines = await listPipelines();
        return NextResponse.json(pipelines);
    } catch {
        return NextResponse.json([], { status: 200 });
    }
}

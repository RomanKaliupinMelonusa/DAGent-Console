import type { FlightData } from "@/types/pipeline";

export interface CompressedFlightItem {
    key: string;
    toolCounts: Record<string, number>;
    intents: string[];
    errorMessage?: string;
}

export function compressFlightData(flightData: FlightData): string {
    const compressed: CompressedFlightItem[] = flightData.map((item) => {
        const entry: CompressedFlightItem = {
            key: item.key,
            toolCounts: item.toolCounts,
            intents: item.intents,
        };
        if (item.errorMessage) {
            entry.errorMessage = item.errorMessage;
        }
        return entry;
    });
    return JSON.stringify(compressed);
}

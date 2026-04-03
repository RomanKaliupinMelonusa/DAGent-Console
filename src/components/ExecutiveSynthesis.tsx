"use client";

import { useCallback, useRef, useState } from "react";

interface ExecutiveSynthesisProps {
    slug: string;
}

export default function ExecutiveSynthesis({ slug }: ExecutiveSynthesisProps) {
    const [markdown, setMarkdown] = useState<string | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const handleGenerate = useCallback(async () => {
        setIsStreaming(true);
        setError(null);
        setMarkdown("");

        const abort = new AbortController();
        abortRef.current = abort;

        try {
            const res = await fetch(
                `/api/synthesis/${encodeURIComponent(slug)}`,
                { method: "POST", signal: abort.signal },
            );

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `Synthesis failed (${res.status})`);
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error("No response stream");

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Parse SSE lines
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? ""; // keep incomplete last line

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    try {
                        const payload = JSON.parse(line.slice(6));
                        if (payload.delta) {
                            setMarkdown((prev) => (prev ?? "") + payload.delta);
                        } else if (payload.error) {
                            throw new Error(payload.error);
                        }
                        // payload.done — stream ended naturally
                    } catch (parseErr) {
                        if (parseErr instanceof Error && parseErr.message !== line.slice(6)) {
                            throw parseErr;
                        }
                    }
                }
            }
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setIsStreaming(false);
            abortRef.current = null;
        }
    }, [slug]);

    const showResult = markdown !== null && markdown.length > 0;

    return (
        <div className="border-t border-zinc-200 px-6 py-4 dark:border-zinc-800" suppressHydrationWarning>
            {!showResult && !isStreaming && !error && (
                <button
                    onClick={handleGenerate}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                    suppressHydrationWarning
                >
                    Generate Executive Post-Mortem
                </button>
            )}

            {error && !isStreaming && (
                <div className="flex flex-col gap-2">
                    <div
                        role="alert"
                        className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
                    >
                        {error}
                    </div>
                    <button
                        onClick={handleGenerate}
                        className="w-fit rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
                    >
                        Retry
                    </button>
                </div>
            )}

            {(showResult || isStreaming) && (
                <div className="mt-1" data-testid="synthesis-result">
                    <h3 className="mb-2 text-sm font-bold text-zinc-700 dark:text-zinc-300">
                        Executive Post-Mortem
                        {isStreaming && (
                            <span className="ml-2 text-xs font-normal text-emerald-500 animate-pulse">
                                ● streaming
                            </span>
                        )}
                    </h3>
                    {isStreaming && !showResult ? (
                        <div className="flex items-center gap-3 py-4">
                            <div className="flex gap-1">
                                <span className="h-2 w-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:0ms]" />
                                <span className="h-2 w-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:150ms]" />
                                <span className="h-2 w-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:300ms]" />
                            </div>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                Analyzing flight data &amp; generating post-mortem…
                            </span>
                        </div>
                    ) : (
                        <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                            {markdown}
                            {isStreaming && <span className="inline-block w-1.5 h-4 bg-indigo-500 animate-pulse align-text-bottom" />}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

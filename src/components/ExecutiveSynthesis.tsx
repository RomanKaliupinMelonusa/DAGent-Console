"use client";

import { useState } from "react";

interface ExecutiveSynthesisProps {
    slug: string;
}

export default function ExecutiveSynthesis({ slug }: ExecutiveSynthesisProps) {
    const [markdown, setMarkdown] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleGenerate() {
        setIsLoading(true);
        setError(null);
        setMarkdown(null);

        try {
            const res = await fetch(
                `/api/synthesis/${encodeURIComponent(slug)}`,
                { method: "POST" },
            );

            if (!res.ok) {
                throw new Error(`Synthesis failed (${res.status})`);
            }

            const body = await res.json();
            setMarkdown(body.markdown ?? "");
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unknown error",
            );
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
            {!markdown && !isLoading && (
                <button
                    onClick={handleGenerate}
                    disabled={isLoading}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
                >
                    Generate Executive Post-Mortem
                </button>
            )}

            {isLoading && (
                <div className="flex flex-col gap-3" data-testid="synthesis-skeleton">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                    <div className="h-4 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                    <div className="h-4 w-5/6 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                    <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                    <div className="h-4 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                    <div className="h-4 w-4/5 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                    <p className="mt-2 text-xs text-zinc-500">
                        Generating executive synthesis — this may take 10-15 seconds…
                    </p>
                </div>
            )}

            {error && (
                <div
                    role="alert"
                    className="mt-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
                >
                    {error}
                </div>
            )}

            {markdown && (
                <div className="mt-3" data-testid="synthesis-result">
                    <h3 className="mb-2 text-sm font-bold text-zinc-700 dark:text-zinc-300">
                        Executive Post-Mortem
                    </h3>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                        {markdown}
                    </div>
                </div>
            )}
        </div>
    );
}

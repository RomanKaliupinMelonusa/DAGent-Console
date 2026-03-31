import { Suspense } from "react";
import Link from "next/link";
import LiveDag from "@/components/LiveDag";
import ActiveAgentHealth from "@/components/ActiveAgentHealth";
import DecisionTimeline from "@/components/DecisionTimeline";
import ExecutiveSynthesis from "@/components/ExecutiveSynthesis";
import PipelineLaunchpad from "@/components/PipelineLaunchpad";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const pipeline = typeof params.pipeline === "string" ? params.pipeline : "";

  return (
    <div className="flex flex-col h-full w-full">
      <header className="flex items-center gap-4 border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <h1 className="text-lg font-bold tracking-tight">DAGent Console</h1>
        {pipeline ? (
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              ← Launchpad
            </Link>
            <span className="text-zinc-600 dark:text-zinc-700">|</span>
            <span className="rounded-full bg-zinc-100 px-3 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {pipeline}
            </span>
          </div>
        ) : null}
      </header>

      <main className="flex-1 min-h-0">
        {pipeline ? (
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full text-sm text-zinc-500">
                Loading DAG…
              </div>
            }
          >
            <div className="grid h-full grid-cols-1 lg:grid-cols-3">
              {/* Left column — The Pulse */}
              <div className="flex flex-col lg:col-span-2">
                <ActiveAgentHealth slug={pipeline} />
                <LiveDag slug={pipeline} />
              </div>

              {/* Right column — The Narrative */}
              <div className="max-h-[800px] overflow-y-auto lg:border-l border-zinc-200 dark:border-zinc-800">
                <DecisionTimeline slug={pipeline} />
                <ExecutiveSynthesis slug={pipeline} />
              </div>
            </div>
          </Suspense>
        ) : (
          <PipelineLaunchpad />
        )}
      </main>
    </div>
  );
}

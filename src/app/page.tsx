import { Suspense } from "react";
import LiveDag from "@/components/LiveDag";

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
        {pipeline && (
          <span className="rounded-full bg-zinc-100 px-3 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {pipeline}
          </span>
        )}
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
            <LiveDag slug={pipeline} />
          </Suspense>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-zinc-500">
            Add <code className="mx-1 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">?pipeline=your-feature</code> to the URL to visualize a pipeline.
          </div>
        )}
      </main>
    </div>
  );
}

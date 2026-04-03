"use client";

import dynamic from "next/dynamic";

const ExecutiveSynthesis = dynamic(
    () => import("@/components/ExecutiveSynthesis"),
    { ssr: false },
);

export default function ExecutiveSynthesisClient({ slug }: { slug: string }) {
    return <ExecutiveSynthesis slug={slug} />;
}

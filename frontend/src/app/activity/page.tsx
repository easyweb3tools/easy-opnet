import { Suspense } from "react";
import { ActivityFeed } from "./ActivityFeed";

export default function ActivityPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">
          Activity
        </h1>
        <p className="mt-1 text-text-secondary">
          Real-time marketplace activity feed — refreshes every 30 seconds
        </p>
      </div>
      <Suspense>
        <ActivityFeed />
      </Suspense>
    </div>
  );
}

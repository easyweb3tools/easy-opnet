import { Suspense } from "react";
import { ExploreContent } from "./ExploreContent";

export default function ExplorePage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">
          Explore
        </h1>
        <p className="mt-1 text-text-secondary">
          Browse all active listings on the marketplace
        </p>
      </div>
      <Suspense>
        <ExploreContent />
      </Suspense>
    </div>
  );
}

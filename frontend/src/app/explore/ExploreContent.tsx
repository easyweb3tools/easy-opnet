"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect, useCallback } from "react";
import { fetchListings } from "@/lib/api";
import { ListingCard } from "@/components/market/ListingCard";
import { NFTGrid } from "@/components/nft/NFTGrid";
import { SkeletonCard } from "@/components/shared/Skeleton";
import type { Listing, ListingSortOption } from "@/types";

const SORT_OPTIONS: { value: ListingSortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "most_bids", label: "Most Bids" },
  { value: "ending_soon", label: "Ending Soon" },
];

const PAGE_SIZE = 12;

export function ExploreContent() {
  const [sort, setSort] = useState<ListingSortOption>("newest");
  const [allItems, setAllItems] = useState<Listing[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["listings", sort, offset],
    queryFn: () => fetchListings({ sort, limit: PAGE_SIZE, offset }),
  });

  // Accumulate items as offset increases
  useEffect(() => {
    if (data) {
      setAllItems((prev) =>
        offset === 0 ? [...data.items] : [...prev, ...data.items],
      );
      setHasMore(offset + PAGE_SIZE < data.total);
    }
  }, [data, offset]);

  // Reset on sort change
  useEffect(() => {
    setAllItems([]);
    setOffset(0);
    setHasMore(true);
  }, [sort]);

  // Infinite scroll via Intersection Observer
  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      if (entry?.isIntersecting && hasMore && !isFetching) {
        setOffset((prev) => prev + PAGE_SIZE);
      }
    },
    [hasMore, isFetching],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: "200px",
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleIntersect]);

  return (
    <div>
      {/* Filter Bar */}
      <div className="mb-8 flex flex-wrap items-center gap-3">
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setSort(option.value)}
            className={`rounded-full px-4 py-2 text-sm transition-colors ${
              sort === option.value
                ? "bg-accent text-white"
                : "border border-border bg-surface text-text-secondary hover:text-text-primary"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading && offset === 0 ? (
        <NFTGrid>
          {Array.from({ length: 8 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </NFTGrid>
      ) : (
        <NFTGrid>
          {allItems.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </NFTGrid>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />

      {/* Loading more indicator */}
      {isFetching && offset > 0 && (
        <div className="mt-6 flex justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
        </div>
      )}

      {/* End of results */}
      {!hasMore && allItems.length > 0 && (
        <p className="mt-8 text-center text-sm text-text-secondary">
          You&apos;ve seen all {allItems.length} listings
        </p>
      )}
    </div>
  );
}

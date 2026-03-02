"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

function isListingSortOption(value: string | null): value is ListingSortOption {
  return SORT_OPTIONS.some((option) => option.value === value);
}

export function ExploreContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSortParam = searchParams.get("sort");
  const initialSort: ListingSortOption = isListingSortOption(initialSortParam)
    ? initialSortParam
    : "newest";
  const [sort, setSort] = useState<ListingSortOption>(initialSort);
  const [allItems, setAllItems] = useState<Listing[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
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

  // Keep sort in URL for shareable/filter-persistent view
  useEffect(() => {
    const currentSort = searchParams.get("sort");
    const targetSort = sort === "newest" ? null : sort;
    if (currentSort === targetSort) return;

    const params = new URLSearchParams(searchParams.toString());
    if (sort === "newest") {
      params.delete("sort");
    } else {
      params.set("sort", sort);
    }
    const query = params.toString();
    router.replace(query ? `/explore?${query}` : "/explore", { scroll: false });
  }, [sort, router, searchParams]);

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
      ) : isError && allItems.length === 0 ? (
        <div className="rounded-2xl border border-error/30 bg-error/5 px-6 py-10 text-center">
          <p className="text-sm text-text-secondary">
            {(error as Error | null)?.message ?? "Failed to load listings."}
          </p>
          <button
            type="button"
            onClick={() => {
              void refetch();
            }}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Retry
          </button>
        </div>
      ) : (
        <NFTGrid>
          {allItems.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </NFTGrid>
      )}

      {!isLoading && !isError && allItems.length === 0 && (
        <p className="py-12 text-center text-sm text-text-secondary">
          No listings found for this sort.
        </p>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />

      {/* Loading more indicator */}
      {isFetching && offset > 0 && (
        <div className="mt-6 flex justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
        </div>
      )}

      {isError && allItems.length > 0 && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="text-sm text-text-secondary">
            {(error as Error | null)?.message ?? "Failed to load more listings."}
          </p>
          <button
            type="button"
            onClick={() => {
              void refetch();
            }}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-primary transition-colors hover:bg-surface-hover"
          >
            Retry Loading
          </button>
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

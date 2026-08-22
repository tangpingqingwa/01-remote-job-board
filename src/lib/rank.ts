import type { Listing, RankedListing } from "./types";

/** Rank is the bid. Equal dollars: older `createdAt` keeps the higher rank. */
export function rankListings(listings: readonly Listing[]): RankedListing[] {
  return listings
    .slice()
    .sort((a, b) => {
      if (b.bidUsd !== a.bidUsd) return b.bidUsd - a.bidUsd;
      if (a.createdAt < b.createdAt) return -1;
      if (a.createdAt > b.createdAt) return 1;
      return 0;
    })
    .map((listing, index) => ({ ...listing, rank: index + 1 }));
}

import type { Listing, RankedListing } from "./types";

/** Polar (or the fixture) has reported paid. Unpaid drafts never rank. */
export function isPaidListing(listing: Pick<Listing, "paidUsd">): boolean {
  return Number.isInteger(listing.paidUsd) && listing.paidUsd >= 1;
}

/** Paid rows only. Unpaid or abandoned checkouts never take a rank. */
export function paidListings<T extends Pick<Listing, "paidUsd">>(
  listings: readonly T[],
): T[] {
  return listings.filter(isPaidListing);
}

/** Rank is the bid. Equal dollars: older `createdAt` keeps the higher rank. */
export function rankListings(listings: readonly Listing[]): RankedListing[] {
  return paidListings(listings)
    .slice()
    .sort((a, b) => {
      if (b.bidUsd !== a.bidUsd) return b.bidUsd - a.bidUsd;
      if (a.createdAt < b.createdAt) return -1;
      if (a.createdAt > b.createdAt) return 1;
      return 0;
    })
    .map((listing, index) => ({ ...listing, rank: index + 1 }));
}

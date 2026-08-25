import { isInRollingWeek } from "./period";
import { isPaidListing } from "./rank";
import type { FunctionLane, Listing } from "./types";

/** In-process paid listings and open checkouts. Board never shows unpaid rows. */
export class BoardStore {
  private listings: Listing[] = [];

  reset(): void {
    this.listings = [];
  }

  listPaid(lane: FunctionLane, periodId: string): Listing[] {
    return this.listings.filter(
      (row) =>
        row.lane === lane &&
        row.periodId === periodId &&
        isPaidListing(row),
    );
  }

  /** Live occupancy: paid rows in the rolling last 7 days, regardless of weekId. */
  listPaidRolling(lane: FunctionLane, now: Date = new Date()): Listing[] {
    return this.listings.filter(
      (row) =>
        row.lane === lane &&
        isPaidListing(row) &&
        isInRollingWeek(row.createdAt, now),
    );
  }

  getById(id: string): Listing | undefined {
    return this.listings.find((row) => row.id === id);
  }

  findByIdentity(
    periodId: string,
    lane: FunctionLane,
    identity: { applyUrl: string; companyHandle: string },
  ): Listing | undefined {
    return this.listings.find(
      (row) =>
        row.periodId === periodId &&
        row.lane === lane &&
        (row.applyUrl === identity.applyUrl ||
          row.companyHandle === identity.companyHandle),
    );
  }

  /** Raise target is the live rolling window, not the audit weekId. */
  findLiveByIdentity(
    lane: FunctionLane,
    identity: { applyUrl: string; companyHandle: string },
    now: Date = new Date(),
  ): Listing | undefined {
    return this.listings.find(
      (row) =>
        row.lane === lane &&
        isPaidListing(row) &&
        isInRollingWeek(row.createdAt, now) &&
        (row.applyUrl === identity.applyUrl ||
          row.companyHandle === identity.companyHandle),
    );
  }

  insertPaid(listing: Listing): void {
    if (!isPaidListing(listing)) return;
    this.listings.push(listing);
  }

  updatePaid(listing: Listing): void {
    const index = this.listings.findIndex((row) => row.id === listing.id);
    if (index === -1) {
      throw new Error(`listing not found: ${listing.id}`);
    }
    this.listings[index] = listing;
  }

  incrementClicks(id: string): Listing | undefined {
    const listing = this.getById(id);
    if (!listing) return undefined;
    const updated: Listing = { ...listing, clicks: listing.clicks + 1 };
    this.updatePaid(updated);
    return updated;
  }
}

export const defaultBoardStore = new BoardStore();

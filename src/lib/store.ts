import type { FunctionLane, Listing } from "./types";

/** In-process paid listings and open checkouts. Board never shows unpaid rows. */
export class BoardStore {
  private listings: Listing[] = [];

  reset(): void {
    this.listings = [];
  }

  listPaid(lane: FunctionLane, periodId: string): Listing[] {
    return this.listings.filter(
      (row) => row.lane === lane && row.periodId === periodId,
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

  insertPaid(listing: Listing): void {
    this.listings.push(listing);
  }

  updatePaid(listing: Listing): void {
    const index = this.listings.findIndex((row) => row.id === listing.id);
    if (index === -1) {
      throw new Error(`listing not found: ${listing.id}`);
    }
    this.listings[index] = listing;
  }
}

export const defaultBoardStore = new BoardStore();

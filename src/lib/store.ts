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

  insertPaid(listing: Listing): void {
    this.listings.push(listing);
  }
}

export const defaultBoardStore = new BoardStore();

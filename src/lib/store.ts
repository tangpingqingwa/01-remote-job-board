import { openBoardDatabase, type BoardDatabase } from "./db";
import { isInRollingWeek } from "./period";
import { isPaidListing } from "./rank";
import type { FunctionLane, Listing } from "./types";
import { isMemoryDatabasePath } from "../payments/env";
import { isProductionRuntime } from "./runtime";

type ListingRow = {
  id: string;
  period_id: string;
  lane: FunctionLane;
  title: string;
  company: string;
  company_handle: string;
  apply_url: string;
  salary_min_usd: number | null;
  salary_max_usd: number | null;
  bid_usd: number;
  paid_usd: number;
  clicks: number;
  created_at: string;
  updated_at: string;
  payer_id: string | null;
};

export type BoardStoreOptions = {
  databasePath?: string;
};

function rowToListing(row: ListingRow): Listing {
  const salary =
    row.salary_min_usd === null || row.salary_max_usd === null
      ? null
      : { minUsd: row.salary_min_usd, maxUsd: row.salary_max_usd };
  return {
    id: row.id,
    periodId: row.period_id,
    lane: row.lane,
    title: row.title,
    company: row.company,
    companyHandle: row.company_handle,
    applyUrl: row.apply_url,
    salary,
    bidUsd: row.bid_usd,
    paidUsd: row.paid_usd,
    clicks: row.clicks,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.payer_id === null ? {} : { payerId: row.payer_id }),
  };
}

const LISTING_COLUMNS = `
  id,
  period_id,
  lane,
  title,
  company,
  company_handle,
  apply_url,
  salary_min_usd,
  salary_max_usd,
  bid_usd,
  paid_usd,
  clicks,
  created_at,
  updated_at,
  payer_id
`;

/**
 * SQLite-backed paid listings. With no explicit DATABASE_PATH the store uses
 * an isolated in-memory database, which keeps fixture callers hermetic. A
 * deployed process should set DATABASE_PATH to a shared file.
 */
export class BoardStore {
  private dbHandle?: BoardDatabase;
  readonly databasePath: string;

  constructor(options: BoardStoreOptions | string = {}) {
    const explicitPath =
      typeof options === "string" ? options : options.databasePath;
    const configuredPath = explicitPath?.trim() || process.env.DATABASE_PATH?.trim();
    if (isProductionRuntime() && (!configuredPath || isMemoryDatabasePath(configuredPath))) {
      throw new Error("BLOCKED-CONFIG: DATABASE_PATH");
    }
    this.databasePath = configuredPath || ":memory:";
  }

  /**
   * Keep module imports side-effect free. Next evaluates route modules in
   * parallel while collecting build metadata; opening the shared SQLite file
   * from every build worker can contend on WAL initialization even though no
   * request is being served. Runtime operations still open and migrate the
   * database synchronously before their first read or write.
   */
  private get db(): BoardDatabase {
    this.dbHandle ??= openBoardDatabase(this.databasePath);
    return this.dbHandle;
  }

  private transaction<T>(operation: () => T): T {
    return this.db.transaction(operation).immediate();
  }

  private readById(id: string): Listing | undefined {
    const row = this.db
      .prepare<[string], ListingRow>(
        `SELECT ${LISTING_COLUMNS} FROM listings WHERE id = ? LIMIT 1`,
      )
      .get(id);
    return row ? rowToListing(row) : undefined;
  }

  reset(): void {
    this.transaction(() => {
      this.db.prepare("DELETE FROM listings").run();
    });
  }

  listPaid(lane: FunctionLane, periodId: string): Listing[] {
    const rows = this.db
      .prepare<[FunctionLane, string], ListingRow>(
        `SELECT ${LISTING_COLUMNS}
         FROM listings
         WHERE lane = ? AND period_id = ? AND paid_usd >= 1
         ORDER BY created_at ASC, id ASC`,
      )
      .all(lane, periodId);
    return rows.map(rowToListing).filter((row) => isPaidListing(row));
  }

  /** Live occupancy: paid rows in the rolling last 7 days, regardless of weekId. */
  listPaidRolling(lane: FunctionLane, now: Date = new Date()): Listing[] {
    const rows = this.db
      .prepare<[FunctionLane], ListingRow>(
        `SELECT ${LISTING_COLUMNS}
         FROM listings
         WHERE lane = ? AND paid_usd >= 1
         ORDER BY created_at ASC, id ASC`,
      )
      .all(lane);
    return rows
      .map(rowToListing)
      .filter((row) => isPaidListing(row))
      .filter((row) => isInRollingWeek(row.createdAt, now));
  }

  getById(id: string): Listing | undefined {
    return this.readById(id);
  }

  findByIdentity(
    periodId: string,
    lane: FunctionLane,
    identity: { applyUrl: string; companyHandle: string },
  ): Listing | undefined {
    const row = this.db
      .prepare<[string, FunctionLane, string, string], ListingRow>(
        `SELECT ${LISTING_COLUMNS}
         FROM listings
         WHERE period_id = ?
           AND lane = ?
           AND (apply_url = ? OR company_handle = ?)
         ORDER BY created_at ASC, id ASC
         LIMIT 1`,
      )
      .get(periodId, lane, identity.applyUrl, identity.companyHandle);
    return row ? rowToListing(row) : undefined;
  }

  /** Raise target is the live rolling window, not the audit weekId. */
  findLiveByIdentity(
    lane: FunctionLane,
    identity: { applyUrl: string; companyHandle: string },
    now: Date = new Date(),
  ): Listing | undefined {
    const rows = this.db
      .prepare<[FunctionLane, string, string], ListingRow>(
        `SELECT ${LISTING_COLUMNS}
         FROM listings
         WHERE lane = ?
           AND paid_usd >= 1
           AND (apply_url = ? OR company_handle = ?)
         ORDER BY created_at ASC, id ASC`,
      )
      .all(lane, identity.applyUrl, identity.companyHandle)
      .map(rowToListing);
    return rows.find((row) => isInRollingWeek(row.createdAt, now));
  }

  insertPaid(listing: Listing): void {
    if (!isPaidListing(listing)) return;
    this.transaction(() => {
      this.db
        .prepare<
          [
            string,
            string,
            FunctionLane,
            string,
            string,
            string,
            string,
            number | null,
            number | null,
            number,
            number,
            number,
            string,
            string,
            string | null,
          ]
        >(
          `INSERT INTO listings (
             id, period_id, lane, title, company, company_handle, apply_url,
             salary_min_usd, salary_max_usd, bid_usd, paid_usd, clicks,
             created_at, updated_at, payer_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          listing.id,
          listing.periodId,
          listing.lane,
          listing.title,
          listing.company,
          listing.companyHandle,
          listing.applyUrl,
          listing.salary?.minUsd ?? null,
          listing.salary?.maxUsd ?? null,
          listing.bidUsd,
          listing.paidUsd,
          listing.clicks,
          listing.createdAt,
          listing.updatedAt,
          listing.payerId ?? null,
        );
    });
  }

  updatePaid(listing: Listing): void {
    if (!isPaidListing(listing)) return;
    this.transaction(() => {
      const result = this.db
        .prepare<
          [
            string,
            FunctionLane,
            string,
            string,
            string,
            string,
            number | null,
            number | null,
            number,
            number,
            string,
            string | null,
            string,
          ]
        >(
          `UPDATE listings SET
             period_id = ?,
             lane = ?,
             title = ?,
             company = ?,
             company_handle = ?,
             apply_url = ?,
             salary_min_usd = ?,
             salary_max_usd = ?,
             bid_usd = MAX(bid_usd, ?),
             paid_usd = MAX(paid_usd, ?),
             updated_at = ?,
             payer_id = ?
           WHERE id = ?`,
        )
        .run(
          listing.periodId,
          listing.lane,
          listing.title,
          listing.company,
          listing.companyHandle,
          listing.applyUrl,
          listing.salary?.minUsd ?? null,
          listing.salary?.maxUsd ?? null,
          listing.bidUsd,
          listing.paidUsd,
          listing.updatedAt,
          listing.payerId ?? null,
          listing.id,
        );
      if (result.changes === 0) {
        throw new Error(`listing not found: ${listing.id}`);
      }
    });
  }

  /** Atomic click increment; concurrent writers cannot overwrite each other. */
  incrementClicks(id: string): Listing | undefined {
    return this.transaction(() => {
      const result = this.db
        .prepare<[string]>(
          "UPDATE listings SET clicks = clicks + 1 WHERE id = ? AND paid_usd >= 1",
        )
        .run(id);
      if (result.changes === 0) return undefined;
      return this.readById(id);
    });
  }

  close(): void {
    if (this.dbHandle?.open) this.dbHandle.close();
    this.dbHandle = undefined;
  }
}

export const defaultBoardStore = new BoardStore();

import { paidListings } from "./rank";
import { defaultBoardStore } from "./store";
import type { FunctionLane, Listing } from "./types";
import { FUNCTION_LANES } from "./types";

export {
  currentPeriodMeta,
  isoWeekPeriodId,
  liveRankResetAt,
  nextMondayUtc,
  placementExpiresAt,
  ROLLING_WEEK_MS,
  type PeriodMeta,
} from "./period";

export const DEFAULT_LANE: FunctionLane = "backend";

const LANE_SET = new Set<string>(FUNCTION_LANES);

export function parseLane(raw: string | string[] | undefined): FunctionLane {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && LANE_SET.has(value)) return value as FunctionLane;
  return DEFAULT_LANE;
}

export function laneLabel(lane: FunctionLane): string {
  switch (lane) {
    case "devrel":
      return "DevRel";
    default:
      return lane.charAt(0).toUpperCase() + lane.slice(1);
  }
}

/** Paid listings only. Unpaid or abandoned checkouts never appear. */
export function getBoardListings(
  lane: FunctionLane,
  periodId: string,
): Listing[] {
  return paidListings(defaultBoardStore.listPaid(lane, periodId));
}

/** Live query: paid placements in the rolling last 7 days. weekId is audit only. */
export function getLiveBoardListings(
  lane: FunctionLane,
  now: Date = new Date(),
): Listing[] {
  return paidListings(defaultBoardStore.listPaidRolling(lane, now));
}

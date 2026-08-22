import { defaultBoardStore } from "./store";
import type { FunctionLane, Listing } from "./types";
import { FUNCTION_LANES } from "./types";

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

export type PeriodMeta = {
  periodId: string;
  nextResetAt: string;
};

/** ISO week in UTC (`YYYY-Www`) and the next Monday 00:00 UTC. */
export function currentPeriodMeta(now: Date = new Date()): PeriodMeta {
  return {
    periodId: isoWeekPeriodId(now),
    nextResetAt: nextMondayUtc(now).toISOString(),
  };
}

export function isoWeekPeriodId(now: Date): string {
  const cursor = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = cursor.getUTCDay() || 7;
  cursor.setUTCDate(cursor.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(cursor.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((cursor.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${cursor.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function nextMondayUtc(now: Date): Date {
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = now.getUTCDay();
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7;
  next.setUTCDate(next.getUTCDate() + daysUntilMonday);
  return next;
}

/** Paid listings only. Unpaid or abandoned checkouts never appear. */
export function getBoardListings(
  lane: FunctionLane,
  periodId: string,
): Listing[] {
  return defaultBoardStore.listPaid(lane, periodId);
}

/** Weekly UTC period helper. Monday 00:00:00.000 UTC starts a new `periodId`. */

export type Cadence = "weekly" | "daily";

export type PeriodMeta = {
  periodId: string;
  nextResetAt: string;
  cadence: Cadence;
  live: boolean;
};

const DAY_MS = 86_400_000;
const WEEK_PERIOD_RE = /^(\d{4})-W(\d{2})$/;
const DAY_PERIOD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type EnvLike = Record<string, string | undefined>;

export function cadenceFromEnv(env: EnvLike = process.env): Cadence {
  return env.CADENCE === "daily" ? "daily" : "weekly";
}

function utcMidnight(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** ISO week in UTC (`YYYY-Www`). Thursday decides the ISO year. */
export function isoWeekPeriodId(now: Date): string {
  const cursor = utcMidnight(now);
  const day = cursor.getUTCDay() || 7;
  cursor.setUTCDate(cursor.getUTCDate() + 4 - day);
  const isoYear = cursor.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((cursor.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7,
  );
  return `${isoYear}-W${pad2(week)}`;
}

/** Next Monday 00:00 UTC. A Monday midnight instant already opened this week. */
export function nextMondayUtc(now: Date): Date {
  const startOfToday = utcMidnight(now).getTime();
  const day = now.getUTCDay();
  if (day === 1) return new Date(startOfToday + 7 * DAY_MS);
  const daysUntilMonday = (8 - day) % 7;
  return new Date(startOfToday + daysUntilMonday * DAY_MS);
}

export function nextResetAt(
  now: Date,
  cadence: Cadence = "weekly",
): Date {
  if (cadence === "daily") {
    return new Date(utcMidnight(now).getTime() + DAY_MS);
  }
  return nextMondayUtc(now);
}

export function currentPeriodId(
  now: Date = new Date(),
  cadence: Cadence = cadenceFromEnv(),
): string {
  if (cadence === "daily") {
    return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
  }
  return isoWeekPeriodId(now);
}

/** ISO week (`YYYY-Www`) or, when `CADENCE=daily`, UTC date (`YYYY-MM-DD`). */
export function currentPeriodMeta(
  now: Date = new Date(),
  cadence: Cadence = cadenceFromEnv(),
): PeriodMeta {
  return {
    periodId: currentPeriodId(now, cadence),
    nextResetAt: nextResetAt(now, cadence).toISOString(),
    cadence,
    live: true,
  };
}

export function isPeriodId(
  raw: string,
  cadence: Cadence = "weekly",
): boolean {
  if (cadence === "daily") return DAY_PERIOD_RE.test(raw);
  const match = WEEK_PERIOD_RE.exec(raw);
  if (!match) return false;
  const week = Number(match[2]);
  return week >= 1 && week <= 53;
}

/** Closed weeks are strictly before the live `periodId`. Future / current / junk are not. */
export function isClosedPeriod(
  requested: string,
  now: Date = new Date(),
  cadence: Cadence = cadenceFromEnv(),
): boolean {
  if (!isPeriodId(requested, cadence)) return false;
  return requested < currentPeriodId(now, cadence);
}

/**
 * Live board uses the current period. `?period=` is honored only when it is an
 * already-closed week (history, no new bids).
 */
export function resolveBoardPeriod(
  requested: string | string[] | undefined,
  now: Date = new Date(),
  cadence: Cadence = cadenceFromEnv(),
): PeriodMeta {
  const raw = Array.isArray(requested) ? requested[0] : requested;
  const current = currentPeriodMeta(now, cadence);
  if (raw && isClosedPeriod(raw, now, cadence)) {
    return {
      periodId: raw,
      nextResetAt: current.nextResetAt,
      cadence,
      live: false,
    };
  }
  return current;
}

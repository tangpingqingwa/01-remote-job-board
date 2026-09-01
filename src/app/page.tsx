import type { Metadata } from "next";
import { Board } from "../components/board/board";
import { getBoardListings, getLiveBoardListings, parseLane } from "../lib/board";
import { liveRankResetAt, resolveBoardPeriod } from "../lib/period";
import { rankListings } from "../lib/rank";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { alternates: { canonical: "/" } };

type HomePageProps = {
  searchParams?: Promise<{
    lane?: string | string[];
    period?: string | string[];
  }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = (await searchParams) ?? {};
  const lane = parseLane(params.lane);
  const now = new Date();
  const period = resolveBoardPeriod(params.period, now);
  const listings = rankListings(
    period.live
      ? getLiveBoardListings(lane, now)
      : getBoardListings(lane, period.periodId),
  );
  const nextResetAt = period.live
    ? liveRankResetAt(listings, now)
    : period.nextResetAt;

  return (
    <Board
      lane={lane}
      periodId={period.periodId}
      nextResetAt={nextResetAt}
      listings={listings}
      live={period.live}
    />
  );
}

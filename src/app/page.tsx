import { Board } from "../components/board/board";
import { currentPeriodMeta, getBoardListings, parseLane } from "../lib/board";
import { rankListings } from "../lib/rank";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<{
    lane?: string | string[];
  }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = (await searchParams) ?? {};
  const lane = parseLane(params.lane);
  const period = currentPeriodMeta();
  const listings = rankListings(getBoardListings(lane, period.periodId));

  return (
    <Board
      lane={lane}
      periodId={period.periodId}
      nextResetAt={period.nextResetAt}
      listings={listings}
    />
  );
}

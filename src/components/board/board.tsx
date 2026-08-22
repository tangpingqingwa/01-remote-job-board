import type { FunctionLane, RankedListing } from "../../lib/types";
import { MIN_BID_USD } from "../../lib/types";
import { BidForm } from "./bid-form";
import { LaneTabs } from "./lane-tabs";
import { Leaderboard } from "./leaderboard";

type BoardProps = {
  lane: FunctionLane;
  periodId: string;
  nextResetAt: string;
  listings: readonly RankedListing[];
};

export function Board({
  lane,
  periodId,
  nextResetAt,
  listings,
}: BoardProps) {
  const topBid = listings[0]?.bidUsd ?? 0;
  const defaultAmount = topBid > 0 ? topBid + 1 : MIN_BID_USD;

  return (
    <main className="board" data-board="" data-lane={lane}>
      <LaneTabs lane={lane} />
      <p className="period-meta" data-period={periodId}>
        Period {periodId}. Next reset {nextResetAt}.
      </p>
      <BidForm lane={lane} defaultAmount={defaultAmount} />
      <Leaderboard lane={lane} listings={listings} />
    </main>
  );
}

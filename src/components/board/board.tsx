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
  live?: boolean;
};

export function Board({
  lane,
  periodId,
  nextResetAt,
  listings,
  live = true,
}: BoardProps) {
  const topBid = listings[0]?.bidUsd ?? 0;
  const defaultAmount = topBid > 0 ? topBid + 1 : MIN_BID_USD;

  return (
    <main
      className="board"
      data-board=""
      data-lane={lane}
      data-period-live={live ? "true" : "false"}
    >
      <LaneTabs lane={lane} periodId={live ? undefined : periodId} />
      <p className="period-meta" data-period={periodId}>
        Period {periodId}. Next reset {nextResetAt}.
        {live ? null : " Closed week — read only."}
      </p>
      {live ? <BidForm lane={lane} defaultAmount={defaultAmount} /> : null}
      <Leaderboard lane={lane} listings={listings} />
    </main>
  );
}

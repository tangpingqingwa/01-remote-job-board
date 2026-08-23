import { laneLabel } from "../../lib/board";
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
      className="board hiring-wall"
      data-board=""
      data-hiring-wall=""
      data-lane={lane}
      data-period-live={live ? "true" : "false"}
    >
      <aside className="wall-rail">
        <p className="wall-rail-kicker">Function lanes</p>
        <LaneTabs lane={lane} periodId={live ? undefined : periodId} />
      </aside>
      <div className="wall-bay">
        <header className="wall-mast">
          <p className="period-meta" data-period={periodId}>
            Period {periodId}. Next reset {nextResetAt}.
            {live ? null : " Closed week — read only."}
          </p>
          <h1 className="wall-lane-name">{laneLabel(lane)}</h1>
          <p className="wall-lane-fact">
            This week&apos;s remote (global) {laneLabel(lane)} wall. Rank is the
            bid.
          </p>
        </header>
        {live ? (
          <BidForm
            lane={lane}
            laneName={laneLabel(lane)}
            defaultAmount={defaultAmount}
            laneEmpty={listings.length === 0}
          />
        ) : null}
        <Leaderboard
          lane={lane}
          listings={listings}
          hideEmptyChrome={live}
        />
      </div>
    </main>
  );
}

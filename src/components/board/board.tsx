import { laneLabel } from "../../lib/board";
import { rankListings } from "../../lib/rank";
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
  const paid = rankListings(listings);
  const topBid = paid[0]?.bidUsd ?? 0;
  const defaultAmount = topBid > 0 ? topBid + 1 : MIN_BID_USD;
  const laneEmpty = paid.length === 0;
  const emptyFirst = live && laneEmpty;
  const occupiedLive = live && !laneEmpty;
  const claimForm = live ? (
    <BidForm
      lane={lane}
      laneName={laneLabel(lane)}
      defaultAmount={defaultAmount}
      laneEmpty={laneEmpty}
    />
  ) : null;
  const lanePlates = (
    <>
      <p className="wall-rail-kicker">Function lanes</p>
      <LaneTabs lane={lane} periodId={live ? undefined : periodId} />
    </>
  );

  return (
    <main
      className="board hiring-wall"
      data-board=""
      data-hiring-wall=""
      data-lane={lane}
      data-period-live={live ? "true" : "false"}
    >
      {emptyFirst ? null : occupiedLive ? null : (
        <aside className="wall-rail">{lanePlates}</aside>
      )}
      <div className="wall-bay">
        <header className="wall-mast">
          <p
            className="period-meta"
            data-period={periodId}
            data-week-window={occupiedLive ? "rolling-7d" : undefined}
            {...(emptyFirst ? { "data-empty-window": "" } : {})}
          >
            {occupiedLive
              ? `Rolling last 7 days from paid placement. Week ${periodId} is an audit label. Next reset ${nextResetAt}.`
              : emptyFirst
                ? "Rolling last 7 days from paid placement. Not Monday 00:00 UTC."
                : `Period ${periodId}. Next reset ${nextResetAt}. Closed week — read only.`}
          </p>
          {emptyFirst ? (
            <p className="wall-lane-fact">
              This remote (global) wall is empty. Rank is the bid. Claim #1,
              then pick the function.
            </p>
          ) : (
            <>
              <h1 className="wall-lane-name">{laneLabel(lane)}</h1>
              <p className="wall-lane-fact">
                {occupiedLive ? (
                  <>
                    This remote (global) {laneLabel(lane)} wall is the rolling last 7 days from paid placement. Rank is the bid.
                  </>
                ) : laneEmpty ? (
                  <>
                    Week {periodId} is read-only week history. Rank is the bid.
                  </>
                ) : (
                  <>
                    This week&apos;s remote (global) {laneLabel(lane)} wall. Rank
                    is the bid.
                  </>
                )}
              </p>
            </>
          )}
        </header>
        {laneEmpty ? claimForm : null}
        <Leaderboard
          lane={lane}
          listings={paid}
          hideEmptyChrome={live}
          closed={!live}
        />
        {occupiedLive ? lanePlates : null}
        {laneEmpty ? null : claimForm}
      </div>
    </main>
  );
}

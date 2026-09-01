import { laneLabel } from "../../lib/board";
import { isoWeekPeriodId } from "../../lib/period";
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

function previousHistoryPeriod(periodId: string): string {
  const daily = /^(\d{4})-(\d{2})-(\d{2})$/.exec(periodId);
  if (daily) {
    const previous = new Date(
      Date.UTC(Number(daily[1]), Number(daily[2]) - 1, Number(daily[3]) - 1),
    );
    return previous.toISOString().slice(0, 10);
  }

  const weekly = /^(\d{4})-W(\d{2})$/.exec(periodId);
  if (!weekly) return periodId;

  const year = Number(weekly[1]);
  const week = Number(weekly[2]);
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const weekday = januaryFourth.getUTCDay() || 7;
  const firstMonday = new Date(
    Date.UTC(year, 0, 4 - weekday + 1),
  );
  firstMonday.setUTCDate(firstMonday.getUTCDate() + (week - 2) * 7);
  return isoWeekPeriodId(firstMonday);
}

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
  const closedEmpty = !live && laneEmpty;
  const closedOccupied = !live && !laneEmpty;
  const functionRailName =
    closedEmpty || closedOccupied ? "Closed week history" : "Function lanes";
  const historyPeriodId = previousHistoryPeriod(periodId);
  const claimForm = live ? (
    <BidForm
      lane={lane}
      laneName={laneLabel(lane)}
      defaultAmount={defaultAmount}
      laneEmpty={laneEmpty}
    />
  ) : null;
  const lanePlates = (
    <section
      className="function-rail"
      id="function-rail"
      aria-labelledby="function-rail-title"
    >
      <p className="wall-rail-kicker" id="function-rail-title">
        {functionRailName}
      </p>
      <LaneTabs
        lane={lane}
        periodId={live ? undefined : periodId}
        label={functionRailName}
        weekHistory={closedOccupied || closedEmpty}
      />
    </section>
  );

  return (
    <main
      className="board hiring-wall"
      data-board=""
      data-hiring-wall=""
      data-lane={lane}
      data-period-live={live ? "true" : "false"}
      data-slot="home-shell"
    >
      <aside className="wall-rail" data-slot="lane-rail">
        <div className="wall-rail-brand" data-slot="wall-brand">
          <div>
            <p className="wall-rail-kicker">remote.jobs</p>
            <p className="wall-rail-title">Hiring wall</p>
          </div>
        </div>
        <div className="wall-rail-window" data-slot="wall-window">
          <span className="wall-rail-label">Window</span>
          <strong>{live ? "Rolling 7 days" : "Closed history"}</strong>
          <span className="wall-rail-period">
            {live ? "Current window" : `${periodId} archive`}
          </span>
        </div>
        {lanePlates}
        <p className="wall-rail-note">
          Rank is the bid. Lower bids still list. Remote roles only.
        </p>
      </aside>
      <div className="wall-bay">
        <header className="wall-mast">
          <div className="board-context">
            <p
              className="period-meta"
              data-period={periodId}
              data-slot="stats-pill"
              data-week-window={occupiedLive ? "rolling-7d" : undefined}
              {...(emptyFirst ? { "data-empty-window": "" } : {})}
              aria-label={
                occupiedLive
                  ? `Rolling last 7 days from paid placement. Each placement expires seven days after payment. Next reset ${nextResetAt}.`
                  : emptyFirst
                    ? "Rolling last 7 days from paid placement. Each placement stays live for seven days."
                    : `Closed week history ${periodId} — read only.`
              }
            >
              <span className="live-dot" aria-hidden="true" />
              {occupiedLive || emptyFirst
                ? "Live · rolling 7 days"
                : "History · read only"}
              <span className="context-audit">
                {live ? "· current window" : `· ${periodId} archive`}
              </span>
            </p>
          </div>
          <div
            className="period-switch"
            role="tablist"
            aria-label="Board period"
            data-slot="period-tabs"
          >
            <a
              href={`/?lane=${lane}`}
              role="tab"
              aria-selected={live}
              className={live ? "period-choice is-current" : "period-choice"}
            >
              Live
            </a>
            <a
              href={`/?lane=${lane}&period=${historyPeriodId}`}
              role="tab"
              aria-selected={!live}
              className={!live ? "period-choice is-current" : "period-choice"}
            >
              History
            </a>
          </div>
          <p className="wall-lane-kicker">Function lane / open roles</p>
          <h1 className="wall-lane-name">{laneLabel(lane)} hiring wall</h1>
          <p className="wall-lane-fact">
            Remote · global · paid placements from the rolling last 7 days.
          </p>
          {!live ? (
            <p className="sr-only">Week {periodId} is read-only week history. Rank is the bid.</p>
          ) : null}
        </header>
        {claimForm}
        <Leaderboard
          lane={lane}
          listings={paid}
          hideEmptyChrome={live}
          closed={!live}
        />
        {emptyFirst ? (
          <details className="board-details">
            <summary>About this live wall</summary>
            <p className="wall-lane-fact">
              This remote (global) wall is empty. Rank is the bid. Enter the
              role identity and choose its function before paying.
            </p>
          </details>
        ) : null}
      </div>
    </main>
  );
}

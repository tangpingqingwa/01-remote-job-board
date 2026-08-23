import { laneLabel } from "../../lib/board";
import { MIN_BID_USD } from "../../lib/types";
import type { FunctionLane, RankedListing } from "../../lib/types";
import { ListingCard } from "./listing-card";

type LeaderboardProps = {
  lane: FunctionLane;
  listings: readonly RankedListing[];
};

export function Leaderboard({ lane, listings }: LeaderboardProps) {
  if (listings.length === 0) {
    return (
      <div className="empty-lane" data-empty-lane="true">
        <p className="empty-lane-kicker">Empty bay</p>
        <p>
          No listings this period in {laneLabel(lane)}. Rank is the bid. This
          lane is empty.
        </p>
        <p>
          Pay ${MIN_BID_USD} to list a remote {laneLabel(lane)} job. Nobody is
          invented here.
        </p>
      </div>
    );
  }

  return (
    <ol className="leaderboard" data-leaderboard="">
      {listings.map((listing) => (
        <li key={listing.id}>
          <ListingCard listing={listing} />
        </li>
      ))}
    </ol>
  );
}

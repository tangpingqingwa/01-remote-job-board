import { laneLabel } from "../../lib/board";
import { MIN_BID_USD } from "../../lib/types";
import type { FunctionLane, RankedListing } from "../../lib/types";
import { ListingCard } from "./listing-card";

type LeaderboardProps = {
  lane: FunctionLane;
  listings: readonly RankedListing[];
  hideEmptyChrome?: boolean;
};

export function Leaderboard({
  lane,
  listings,
  hideEmptyChrome = false,
}: LeaderboardProps) {
  if (listings.length === 0) {
    if (hideEmptyChrome) {
      return (
        <div
          className="empty-lane empty-lane-quiet"
          data-empty-lane="true"
          data-empty-quiet="true"
        >
          <p className="sr-only">
            No listings this period in {laneLabel(lane)}. Rank is the bid. This
            lane is empty. Claim #1 above for ${MIN_BID_USD}. Nobody is invented
            here.
          </p>
        </div>
      );
    }

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

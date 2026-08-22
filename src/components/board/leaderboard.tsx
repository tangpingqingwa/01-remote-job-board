import { laneLabel } from "../../lib/board";
import type { FunctionLane, RankedListing } from "../../lib/types";
import { ListingCard } from "./listing-card";

type LeaderboardProps = {
  lane: FunctionLane;
  listings: readonly RankedListing[];
};

export function Leaderboard({ lane, listings }: LeaderboardProps) {
  if (listings.length === 0) {
    return (
      <p className="empty-lane" data-empty-lane="true">
        No listings this period in {laneLabel(lane)}. Rank is the bid. This
        lane is empty.
      </p>
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

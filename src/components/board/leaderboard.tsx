import { laneLabel } from "../../lib/board";
import { rankListings } from "../../lib/rank";
import { MIN_BID_USD } from "../../lib/types";
import type { FunctionLane, RankedListing } from "../../lib/types";
import { ListingCard } from "./listing-card";

function sortableTime(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatActivityTime(listing: RankedListing): string {
  const timestamp = Math.max(
    sortableTime(listing.createdAt),
    sortableTime(listing.updatedAt),
  );
  if (timestamp === 0) return "time unavailable";

  const date = new Date(timestamp);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day} ${hours}:${minutes} UTC`;
}

function activityVerb(listing: RankedListing): "Listed" | "Updated" {
  return sortableTime(listing.updatedAt) > sortableTime(listing.createdAt)
    ? "Updated"
    : "Listed";
}

function formatBid(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

function formatClickCount(clicks: number): string {
  return `${clicks} ${clicks === 1 ? "click" : "clicks"}`;
}

function LowerFold({ listings }: { listings: readonly RankedListing[] }) {
  const topThree = listings.slice(0, 3);
  const activity = [...listings]
    .sort((left, right) => {
      const updatedDelta =
        sortableTime(right.updatedAt) - sortableTime(left.updatedAt);
      if (updatedDelta !== 0) return updatedDelta;
      const createdDelta =
        sortableTime(right.createdAt) - sortableTime(left.createdAt);
      return createdDelta !== 0
        ? createdDelta
        : left.id.localeCompare(right.id);
    })
    .slice(0, 5);

  return (
    <div className="lower-fold" data-lower-fold="">
      <section
        className="today-ranking"
        data-today-ranking=""
        data-slot="today-strip"
      >
        <div className="lower-fold-heading">
          <h2>Current ranking</h2>
          <span>Bid order</span>
        </div>
        <ol className="today-ranking-list">
          {topThree.map((listing) => (
            <li
              className="today-ranking-item"
              data-ranking-item=""
              data-listing-id={listing.id}
              key={listing.id}
            >
              <span className="compact-rank">#{listing.rank}</span>
              <span className="compact-copy">
                <strong>{listing.title}</strong>
                <span>{listing.company}</span>
              </span>
              <span className="compact-bid">{formatBid(listing.bidUsd)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="latest-activity"
        data-latest-activity=""
        data-slot="activity-strip"
      >
        <div className="lower-fold-heading">
          <h2>Latest activity</h2>
          <span>Listing facts</span>
        </div>
        <ol className="activity-list">
          {activity.map((listing) => (
            <li
              className="activity-item"
              data-activity-id={listing.id}
              key={listing.id}
            >
              <span className="activity-copy">
                {listing.company} · {listing.title}
              </span>
              <span className="activity-meta">
                {activityVerb(listing)} {formatActivityTime(listing)} ·{" "}
                {formatClickCount(listing.clicks)}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

type LeaderboardProps = {
  lane: FunctionLane;
  listings: readonly RankedListing[];
  hideEmptyChrome?: boolean;
  closed?: boolean;
};

export function Leaderboard({
  lane,
  listings,
  hideEmptyChrome = false,
  closed = false,
}: LeaderboardProps) {
  listings = rankListings(listings);
  if (listings.length === 0) {
    if (hideEmptyChrome) {
      return (
        <div
          className="empty-lane empty-lane-quiet"
          data-empty-lane="true"
          data-empty-quiet="true"
          data-empty-honest=""
        >
          <p className="empty-lane-kicker">Empty lane</p>
          <p>
            No paid {laneLabel(lane)} roles in the rolling last 7 days.
          </p>
          <p>
            Claim #1 above to list a remote {laneLabel(lane)} role.
          </p>
          <p className="sr-only">
            Rank is the bid. Nobody is invented here. The minimum bid is ${MIN_BID_USD}.
          </p>
        </div>
      );
    }

    if (closed) {
      return (
        <div
          className="empty-lane"
          data-empty-lane="true"
          data-empty-closed="true"
          data-empty-honest=""
        >
          <p className="empty-lane-kicker">Closed week history</p>
          <p>
            No listings in closed week history in {laneLabel(lane)}. Rank is
            the bid. Closed week history was empty. Nobody is invented here.
          </p>
          <p>
            Bids are closed in closed week history.{" "}
            <a href={`/?lane=${lane}`} data-live-week="">
              Open the live {laneLabel(lane)} wall for the rolling last 7 days from paid placement
            </a>
            .
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

  const topThree = listings.filter((listing) => listing.rank <= 3);
  const lead = topThree[0];
  const later = listings.filter((listing) => listing.rank > 1);

  return (
    <div className="leaderboard-bay" data-leaderboard="">
      {lead ? (
        <ol
          className="leaderboard leaderboard-prize leaderboard-lead"
          data-prize-pack=""
          data-lead-pack=""
          data-highlighted-ranks="1"
          data-slot="lead-role"
          aria-label={
            closed
              ? "Closed week history #1 role"
              : "Rolling last 7 days #1 role"
          }
        >
          <li
            key={lead.id}
            data-slot="paid-card"
            data-rank={lead.rank}
            data-lead-role=""
          >
            <ListingCard listing={lead} live={!closed} />
          </li>
        </ol>
      ) : null}
      {later.length > 0 ? (
        <section className="placement-ledger" data-placement-ledger="">
          <div className="ledger-heading">
            <h2>More placements</h2>
            <span>Ranked by bid</span>
          </div>
          <ol
            className="leaderboard leaderboard-later"
            data-later-pack=""
            data-highlighted-ranks="2-plus"
            data-slot="later-rows"
            aria-label={
              closed
                ? "Later ranks in closed week history"
                : "Later ranks in the rolling last 7 days"
            }
          >
            {later.map((listing) => (
              <li key={listing.id} data-slot="paid-card" data-rank={listing.rank}>
                <ListingCard listing={listing} live={!closed} />
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {!closed ? <LowerFold listings={listings} /> : null}
    </div>
  );
}

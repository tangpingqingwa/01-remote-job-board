import type { RankedListing } from "../../lib/types";

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

export function formatClicks(clicks: number): string {
  return `${clicks} ${clicks === 1 ? "click" : "clicks"}`;
}

export function ListingCard({ listing }: { listing: RankedListing }) {
  return (
    <article
      className="card"
      data-listing-card=""
      data-rank={listing.rank}
      data-listing-id={listing.id}
    >
      <span className="rank">#{listing.rank}</span>
      <div className="card-body">
        <div className="card-top">
          <h3 className="title">{listing.title}</h3>
          <p className="bid" data-bid="">
            {formatUsd(listing.bidUsd)}
          </p>
        </div>
        <p className="company" data-company="">
          {listing.company}
        </p>
        <p className="remote">Remote (global)</p>
        {listing.salary ? (
          <p className="salary" data-salary="">
            {formatUsd(listing.salary.minUsd)}–{formatUsd(listing.salary.maxUsd)}
          </p>
        ) : null}
        <p className="meta">
          <span className="clicks" data-clicks="">
            {formatClicks(listing.clicks)}
          </span>
        </p>
      </div>
    </article>
  );
}

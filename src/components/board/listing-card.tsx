import { applyClickPath } from "../../lib/clicks";
import type { RankedListing } from "../../lib/types";

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

export function formatClicks(clicks: number): string {
  return `${clicks} ${clicks === 1 ? "click" : "clicks"}`;
}

type ListingCardProps = {
  listing: RankedListing;
  live?: boolean;
};

export function ListingCard({ listing, live = true }: ListingCardProps) {
  const takeApply = live && listing.rank === 1;
  const laterApply = live && listing.rank > 1;
  const laterQuiet = listing.rank > 1;

  return (
    <article
      className="card job-sheet"
      data-listing-card=""
      data-rank={listing.rank}
      data-listing-id={listing.id}
      {...(takeApply ? { "data-take-apply": "" } : {})}
      {...(laterApply ? { "data-later-apply": "" } : {})}
      {...(laterQuiet ? { "data-later-quiet": "" } : {})}
    >
      <span className="sheet-pin" aria-hidden="true" />
      <p className="sheet-rankline">
        <span className="rank">#{listing.rank}</span>
        <span className="remote">Remote (global)</span>
      </p>
      <div className="card-body">
        <h3
          className="title"
          {...(listing.rank === 1 ? { "data-prize-title": "" } : {})}
        >
          {listing.title}
        </h3>
        <p className="company" data-company="">
          {listing.company}
        </p>
        {listing.salary ? (
          <p className="salary" data-salary="">
            {formatUsd(listing.salary.minUsd)}–{formatUsd(listing.salary.maxUsd)}
          </p>
        ) : null}
        <p
          className="sheet-apply"
          {...(takeApply ? { "data-apply-after-identity": "" } : {})}
        >
          <a
            className="apply"
            href={applyClickPath(listing.id)}
            data-apply-url={listing.applyUrl}
            {...(takeApply
              ? {
                  "data-apply-live": "",
                  "data-first-click": "apply",
                  "data-apply-after-list-first": "",
                  "data-apply-after-list-two": "",
                  "data-apply-after-list-three": "",
                  "data-apply-after-list-four": "",
                  "data-apply-after-list-five": "",
                  "data-apply-after-list-six": "",
                }
              : {})}
            {...(laterApply
              ? { "data-apply-later": "", "data-apply-later-outlined": "" }
              : {})}
          >
            Apply
          </a>
        </p>
        {takeApply ? (
          <p className="list-after-apply-wrap">
            <a
              className="list-after-apply"
              href="#claim"
              data-list-after-apply=""
              data-list-after-apply-first=""
              data-list-after-apply-two=""
              data-list-after-apply-three=""
              data-list-after-apply-four=""
              data-list-after-apply-five=""
              data-list-after-apply-six=""
              data-list-after-apply-seven=""
            >
              List a role
            </a>{" "}
            after Apply. Paying less than #1 still lists.
          </p>
        ) : null}
        <p className="meta">
          <span className="bid" data-bid="">
            {formatUsd(listing.bidUsd)}
          </span>
          <span className="clicks" data-clicks="">
            {formatClicks(listing.clicks)}
          </span>
        </p>
      </div>
    </article>
  );
}

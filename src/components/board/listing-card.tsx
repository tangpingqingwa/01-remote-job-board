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
  const prize = listing.rank === 1;
  const takeApply = live && prize;
  const laterApply = live && !prize;
  const laterQuiet = !prize;

  return (
    <article
      className={prize ? "card job-sheet" : "card later-sheet"}
      data-listing-card=""
      data-rank={listing.rank}
      data-listing-id={listing.id}
      {...(takeApply ? { "data-take-apply": "" } : {})}
      {...(laterApply ? { "data-later-apply": "" } : {})}
      {...(laterQuiet ? { "data-later-quiet": "" } : {})}
    >
      {prize ? <span className="sheet-pin" aria-hidden="true" /> : null}
      <p className={prize ? "sheet-rankline" : "later-rankline"}>
        <span className="rank">#{listing.rank}</span>
        {prize ? null : (
          <span className="later-role" data-later-role="">
            {listing.title}
          </span>
        )}
        <span className="remote">Remote (global)</span>
      </p>
      <div className="card-body">
        {prize ? (
          <h3 className="title" data-prize-title="">
            {listing.title}
          </h3>
        ) : null}
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
        <p
          className="meta"
          {...(listing.rank === 1 ? { "data-later-fact": "" } : {})}
        >
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

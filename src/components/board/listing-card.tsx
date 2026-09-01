import { applyClickPath } from "../../lib/clicks";
import { laneLabel } from "../../lib/board";
import { isPaidListing } from "../../lib/rank";
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
  if (!isPaidListing(listing)) return null;
  const prize = listing.rank === 1;
  const takeApply = live && prize;
  const laterApply = live && !prize;
  const laterQuiet = !prize;
  const hasApplyUrl = Boolean(listing.applyUrl);
  const laneName = laneLabel(listing.lane);

  return (
    <article
      className={prize ? "card job-sheet" : "card later-sheet"}
      data-listing-card=""
      data-rank={listing.rank}
      data-listing-id={listing.id}
      data-card-kind={prize ? "lead" : "ledger"}
      {...(takeApply ? { "data-take-apply": "" } : {})}
      {...(laterApply ? { "data-later-apply": "" } : {})}
      {...(laterQuiet ? { "data-later-quiet": "" } : {})}
    >
      <p className={prize ? "sheet-rankline" : "later-rankline"}>
        <span className="rank" aria-label={`Rank ${listing.rank}`}>
          #{listing.rank}
        </span>
      </p>
      <div className="card-body">
        <div className="card-heading">
          {prize ? (
            <h3 className="title" data-prize-title="">
              {hasApplyUrl ? (
                <a
                  className="role-link"
                  href={applyClickPath(listing.id)}
                  aria-label={`Open ${listing.title} application`}
                  data-card-surface=""
                >
                  {listing.title}
                </a>
              ) : (
                listing.title
              )}
            </h3>
          ) : (
            <h3 className="title later-role" data-later-role="">
              {hasApplyUrl ? (
                <a
                  className="role-link"
                  href={applyClickPath(listing.id)}
                  aria-label={`Open ${listing.title} application`}
                  data-card-surface=""
                >
                  {listing.title}
                </a>
              ) : (
                listing.title
              )}
            </h3>
          )}
          <span className="bid" data-bid="">
            {formatUsd(listing.bidUsd)}
          </span>
        </div>
        <p className="company" data-company="">
          {listing.company}
        </p>
        <p className="listing-summary">
          <span className="remote">Remote (global)</span>
          <span>{laneName} role</span>
          {listing.salary ? (
            <span className="salary" data-salary="">
              · {formatUsd(listing.salary.minUsd)}–{formatUsd(listing.salary.maxUsd)}
            </span>
          ) : null}
        </p>
        <p
          className="meta"
          {...(listing.rank === 1 ? { "data-later-fact": "" } : {})}
        >
          <span className="meta-copy">
            {laneName} · paid placement
          </span>
          <span className="clicks" data-clicks="">
            {formatClicks(listing.clicks)}
          </span>
        </p>
        <p
          className="sheet-apply"
          {...(takeApply ? { "data-apply-state": "first" } : {})}
        >
          {prize ? (
            hasApplyUrl ? (
              <a
                className="apply"
                href={applyClickPath(listing.id)}
                data-apply-url={listing.applyUrl}
                {...(takeApply
                  ? { "data-apply-live": "", "data-first-click": "apply" }
                  : {})}
              >
                Apply
              </a>
            ) : (
              <span className="apply unavailable" data-apply-unavailable="">
                Apply unavailable
              </span>
            )
          ) : hasApplyUrl ? (
            <a
              className="later-apply"
              href={applyClickPath(listing.id)}
              data-apply-url={listing.applyUrl}
              {...(laterApply
                ? { "data-apply-later": "", "data-apply-later-outlined": "" }
                : {})}
            >
              Apply
            </a>
          ) : (
            <span className="later-apply unavailable" data-apply-unavailable="">
              Apply unavailable
            </span>
          )}
        </p>
        {takeApply ? (
          <a
            className="hover-claim"
            href="#claim"
            data-hover-claim=""
            aria-label={`Claim this rank for ${formatUsd(listing.bidUsd + 1)}`}
          >
            Claim this rank for {formatUsd(listing.bidUsd + 1)}
          </a>
        ) : null}
        {takeApply ? (
          <p className="list-after-apply-wrap">
            <a
              className="list-after-apply"
              href="#claim"
              data-list-after-apply=""
              data-list-action="role"
            >
              List a role
            </a>{" "}
            after Apply. Paying less than #1 still lists.
          </p>
        ) : null}
      </div>
    </article>
  );
}

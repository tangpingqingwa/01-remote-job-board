import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rules · Remote Job Board",
  description:
    "Rank is the bid. Min $5, max $50,000. Weekly UTC reset. No invented salaries. Global remote.",
};

export default function RulesPage() {
  return (
    <main className="doc-page" data-page="rules">
      <h1>Rules</h1>
      <p>
        These rules are the product. A bidder can predict rank from this page
        alone. Rank is the bid.
      </p>

      <h2>Ranking</h2>
      <table>
        <tbody>
          <tr>
            <th>Rank is the bid</th>
            <td>
              Sort key is <code>bidUsd</code> descending. Nothing else (clicks,
              company size, recency of raise except the tie-break) moves rank.
            </td>
          </tr>
          <tr>
            <th>Whole dollars</th>
            <td>Bids are integers ≥ 1. No cents. Step is $1.</td>
          </tr>
          <tr>
            <th>Minimum</th>
            <td>
              First bid on a listing in a period must be <strong>≥ $5</strong>.
            </td>
          </tr>
          <tr>
            <th>Maximum</th>
            <td>
              Any bid (first or raise) must be <strong>≤ $50,000</strong>.
            </td>
          </tr>
          <tr>
            <th>Below #1 still lists</th>
            <td>
              A $5 bid on a lane whose #1 is $200 lists at the first rank whose
              current bid is &lt; 5, or last if every bid is ≥ 5.
            </td>
          </tr>
          <tr>
            <th>Equal bids</th>
            <td>
              The <strong>older</strong> listing (<code>createdAt</code>{" "}
              earlier) keeps the higher rank.
            </td>
          </tr>
          <tr>
            <th>Identity</th>
            <td>
              A listing is keyed by <code>(periodId, lane, identity)</code>.{" "}
              <code>identity</code> is the canonical apply URL when present,
              else the company handle.
            </td>
          </tr>
          <tr>
            <th>Raise</th>
            <td>
              Submitting the same apply URL or the same company handle in the
              same lane + period updates that listing. New bid must be{" "}
              <strong>≥ current bid + 1</strong>. Payer pays{" "}
              <strong>newBid − currentBid</strong> only.
            </td>
          </tr>
          <tr>
            <th>Cannot steal the difference</th>
            <td>
              A different checkout identity cannot raise listing A by paying
              only <code>newBid − A.bid</code>. They must pay the{" "}
              <strong>full</strong> new bid as a new listing (or fail{" "}
              <code>raise_not_owner</code>). They cannot inherit A&apos;s paid
              amount. v1 rejects a second payer on an existing identity (
              <code>identity_taken</code>).
            </td>
          </tr>
          <tr>
            <th>Raise to take #1</th>
            <td>
              To become #1, <code>newBid</code> must be{" "}
              <strong>≥ currentTopBid + 1</strong>. Equal to the top bid is not
              enough (older keeps the higher rank).
            </td>
          </tr>
          <tr>
            <th>Period</th>
            <td>
              Rankings are computed only among listings in the{" "}
              <strong>current</strong> period for that lane. Prior periods are
              history, not the live board.
            </td>
          </tr>
          <tr>
            <th>Payment claims rank</th>
            <td>
              An unpaid or abandoned checkout does not appear. Rank updates
              only after a completed payment (live Polar or fixture).
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Worked examples</h2>
      <ol>
        <li>Lane empty. Acme bids $5 → #1 at $5.</li>
        <li>Beta bids $20 → Beta #1 ($20), Acme #2 ($5).</li>
        <li>
          Acme raises to $21 and pays $16. Acme #1 ($21), Beta #2 ($20).
        </li>
        <li>
          Gamma bids $21. Tie on dollars; Acme is older → Acme #1, Gamma #2,
          Beta #3.
        </li>
        <li>
          Delta tries to submit Acme&apos;s apply URL and pay $1 (the
          difference to $22). Rejected: not the owner (
          <code>raise_not_owner</code>). A second payer on that identity is{" "}
          <code>identity_taken</code>.
        </li>
      </ol>

      <h2>Weekly UTC reset</h2>
      <table>
        <tbody>
          <tr>
            <th>Period length</th>
            <td>7 days. Default is a weekly reset per function lane.</td>
          </tr>
          <tr>
            <th>Boundary</th>
            <td>
              <strong>Monday 00:00:00.000 UTC</strong>
            </td>
          </tr>
          <tr>
            <th>
              <code>periodId</code>
            </th>
            <td>
              ISO week in UTC, <code>YYYY-Www</code> (e.g. <code>2026-W34</code>
              ).
            </td>
          </tr>
          <tr>
            <th>What resets</th>
            <td>Live rank, bids, and click counters for the new period.</td>
          </tr>
          <tr>
            <th>What does not carry</th>
            <td>
              Previous period bid amounts. A company that wants #1 next week
              pays again.
            </td>
          </tr>
          <tr>
            <th>History</th>
            <td>
              Prior-period listings remain readable at{" "}
              <code>/board?lane=backend&amp;period=2026-W33</code> (no new bids
              on a closed period).
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        The board header shows the current period and the UTC instant of the
        next reset. Daily mode (<code>CADENCE=daily</code>) is a documented
        future flag. v1 ships weekly.
      </p>

      <h2>Listings</h2>
      <p>
        Every listing is a <strong>remote</strong> job. There is no city field.
        Copy may say &quot;Remote (global)&quot;. Do not default a city.
      </p>
      <p>
        <strong>Salary honesty:</strong> a salary band is present only when the
        poster typed both bounds. The UI must not fill &quot;$0&quot;,
        &quot;competitive&quot;, or a scraped band. Missing salary renders as
        no salary line. We never invent salaries.
      </p>

      <h2>Apply URLs</h2>
      <p>
        Apply URLs are cleaned and then validated. Failures are{" "}
        <code>422</code>.
      </p>
      <ol>
        <li>
          Require <code>https:</code> (not <code>http:</code>).
        </li>
        <li>
          Resolve one redirect hop for known shortener hosts and replace the
          stored URL with the final <code>https</code> target. Do not store the
          shortener.
        </li>
        <li>
          Strip the query string and fragment entirely (tracking, affiliate,{" "}
          <code>utm_*</code>, <code>ref</code>, <code>fbclid</code>,{" "}
          <code>gclid</code>).
        </li>
        <li>
          Normalize: lowercase host, strip default <code>:443</code>, strip
          trailing slash, reject credentials in the URL.
        </li>
        <li>
          Reject chat / invite hosts and paths: Telegram, WhatsApp, Discord,
          Messenger, Signal, Slack invite, Line, WeChat, Kakao, and similar
          invite links.
        </li>
        <li>
          Reject NSFW / adult hosts and path keywords (porn, onlyfans, fansly,
          and documented equivalents).
        </li>
        <li>
          Reject <code>javascript:</code>, <code>data:</code>, and non-http(s)
          schemes.
        </li>
        <li>
          Identity collision: same canonical apply URL or same company handle
          in the same <code>(periodId, lane)</code> is a <strong>raise</strong>{" "}
          of that listing, not a second card.
        </li>
      </ol>
      <p>
        Clicks: <code>GET /out/:listingId</code> increments the public click
        count and <strong>302</strong>s to the stored apply URL with{" "}
        <strong>no</strong> query parameters added.
      </p>
    </main>
  );
}

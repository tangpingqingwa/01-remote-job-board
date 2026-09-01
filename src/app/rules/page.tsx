import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rules · Remote Job Board",
  description:
    "Rank is the bid. Minimum $5, maximum $50,000, with a rolling seven-day placement window.",
  alternates: { canonical: "/rules" },
};

export default function RulesPage() {
  return (
    <main className="doc-page" data-page="rules">
      <h1>Rules</h1>
      <p>
        The board follows the published rules below. There are no hidden
        ranking factors: rank is the bid.
      </p>

      <h2>Ranking</h2>
      <table>
        <tbody>
          <tr>
            <th>Rank is the bid</th>
            <td>
              Listings are ordered by bid from highest to lowest. Clicks,
              company size, and editorial preference do not affect rank.
            </td>
          </tr>
          <tr>
            <th>Whole dollars</th>
            <td>Bids use whole US dollars. The step is $1.</td>
          </tr>
          <tr>
            <th>Minimum</th>
            <td>
              A new listing starts at <strong>$5</strong> or more.
            </td>
          </tr>
          <tr>
            <th>Maximum</th>
            <td>
              A bid or raise cannot exceed <strong>$50,000</strong>.
            </td>
          </tr>
          <tr>
            <th>Below #1 still lists</th>
            <td>
              A bid below the current leader still appears at the rank that
              amount can take.
            </td>
          </tr>
          <tr>
            <th>Equal bids</th>
            <td>The listing placed first keeps the higher rank.</td>
          </tr>
          <tr>
            <th>Listing identity</th>
            <td>
              The same apply link or company handle in the same function lane
              is treated as the same active listing during its seven-day run.
            </td>
          </tr>
          <tr>
            <th>Raise</th>
            <td>
              A raise must add at least $1. The original payer pays only the
              difference between the current bid and the new bid.
            </td>
          </tr>
          <tr>
            <th>Listing ownership</th>
            <td>
              Another employer cannot take over an existing listing by paying
              only its raise amount. A different employer submits a new
              listing and pays its full bid.
            </td>
          </tr>
          <tr>
            <th>Take #1</th>
            <td>
              To move above the current leader, the new bid must be at least
              $1 higher. Matching the leader is not enough because older
              listings win ties.
            </td>
          </tr>
          <tr>
            <th>Payment claims rank</th>
            <td>
              Rank changes only after payment is confirmed. An incomplete or
              abandoned checkout never appears on the board.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Worked example</h2>
      <ol>
        <li>Acme bids $5 and takes #1 on an empty lane.</li>
        <li>Beta bids $20 and becomes #1; Acme moves to #2.</li>
        <li>Acme raises to $21, pays the $16 difference, and retakes #1.</li>
        <li>
          Gamma bids $21. Acme remains higher because its listing was placed
          first.
        </li>
      </ol>

      <h2>Rolling seven-day window</h2>
      <table>
        <tbody>
          <tr>
            <th>Duration</th>
            <td>Each paid placement remains eligible for seven days.</td>
          </tr>
          <tr>
            <th>Boundary</th>
            <td>
              The window follows each placement time. It does not reset for
              everyone at Monday midnight.
            </td>
          </tr>
          <tr>
            <th>Expiry</th>
            <td>
              When a placement reaches seven days, it leaves the live ranking.
              Remaining paid listings keep their bid order.
            </td>
          </tr>
          <tr>
            <th>Return to the board</th>
            <td>
              An expired employer may place a new full bid to appear again.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Listings</h2>
      <p>
        Every listing must be a remote job. Salary appears only when the
        employer supplies both ends of a range. The board never inserts an
        estimated or placeholder salary.
      </p>

      <h2>Apply links</h2>
      <ol>
        <li>Use a secure, public job-application link.</li>
        <li>Tracking and affiliate parameters are removed.</li>
        <li>Link shorteners, chat invitations, and adult content are rejected.</li>
        <li>
          Private, local-only, credentialed, or otherwise unsafe destinations
          are rejected before checkout.
        </li>
        <li>
          Reusing the same application link during an active placement is a
          raise, not a second card.
        </li>
      </ol>
      <p>
        Outbound clicks are counted publicly and go to the cleaned application
        link. Clicks never change rank.
      </p>
    </main>
  );
}

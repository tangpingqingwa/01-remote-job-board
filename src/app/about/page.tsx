import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About · Remote Job Board",
  description:
    "No ads, no API keys, no revenue share. Rank is the bid. Global remote, English, USD.",
};

export default function AboutPage() {
  return (
    <main className="doc-page" data-page="about">
      <h1>About</h1>
      <p>
        This is a public rolling last-7-days auction for the #1 remote job in a
        function lane. A company posts a remote job and a whole-dollar USD bid.
        The listing with the highest bid is #1. Paying less than #1 still lists,
        at the rank that bid can take.
      </p>
      <p>
        <strong>Rank is the bid</strong> — nothing else. Clicks, company size,
        and how recently someone raised do not move rank (equal bids keep the
        older listing higher).
      </p>
      <p>
        There are <strong>no ads</strong>, <strong>no API keys</strong>, and{" "}
        <strong>no revenue share</strong> with listed companies. Polar is
        Merchant of Record in live; that fee is the operator&apos;s cost, not a
        cut of the hire. There is no API-key product.
      </p>
      <p>
        Copy is <strong>English</strong>. Currency is <strong>USD</strong>. The
        market is <strong>global remote</strong>. There is no default city, no
        China-city default, and no geo-restricted board.
      </p>
      <p>
        Clicks on the apply URL are counted and shown on the card. We never
        invent a salary. If the poster omitted a band, the card has no salary
        line — not &quot;$0&quot;, not &quot;competitive&quot;, not a scraped
        estimate.
      </p>
      <p>
        <a href="/rules">Read the rules</a> for ranking, the $5 minimum and
        $50,000 maximum, raise-the-difference, and the rolling last 7 days from
        paid placement.
      </p>
    </main>
  );
}

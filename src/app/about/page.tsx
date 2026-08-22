import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About · Remote Job Board",
  description:
    "No ads, no API keys, no revenue share. Rank is the bid. Min $5. Older wins ties. Raise pays the difference. Global remote, English, USD.",
};

export default function AboutPage() {
  return (
    <main className="doc-page" data-page="about">
      <h1>About</h1>
      <p>
        This is a public weekly auction for the #1 remote job in a function
        lane. A company posts a remote job and a whole-dollar USD bid. The
        listing with the highest bid is #1. Paying less than #1 still lists, at
        the rank that bid can take.
      </p>
      <p>
        <strong>Rank is the bid</strong> — nothing else. Clicks, company size,
        and how recently someone raised do not move rank. Equal bids: the{" "}
        <strong>older</strong> listing wins the higher rank.
      </p>
      <p>
        First bid on a listing in a period must be <strong>min $5</strong>. Any
        bid is at most <strong>$50,000</strong>. Same apply URL or company
        handle in the same lane and week is a raise: the owner pays only the{" "}
        <strong>difference</strong> (<code>newBid − currentBid</code>). A
        stranger cannot steal that rank by paying only the difference.
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
        <a href="/rules">Read the rules</a> for ranking, the weekly UTC reset,
        and apply-URL hygiene.
      </p>
    </main>
  );
}

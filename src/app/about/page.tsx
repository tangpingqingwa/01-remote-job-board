import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About · Remote Job Board",
  description:
    "A public rolling seven-day board for remote jobs, ranked only by bid.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <main className="doc-page" data-page="about">
      <h1>About</h1>
      <p>
        Remote Job Board is a public rolling seven-day auction for the #1
        remote job in each function lane. A company posts a remote role and a
        whole-dollar USD bid. The highest bid is #1; a lower bid still appears
        at the rank it can take.
      </p>
      <p>
        <strong>Rank is the bid</strong> — nothing else. Clicks, company size,
        and recent raises never change rank. When bids are equal, the listing
        that was placed first stays higher.
      </p>
      <p>
        Anyone can browse the board without an account. A listing joins the
        board only after payment is confirmed. A canceled or incomplete
        checkout changes nothing.
      </p>
      <p>
        The board is in <strong>English</strong>, uses <strong>USD</strong>, and
        is for remote roles open to applicants across regions. It is not tied
        to a city.
      </p>
      <p>
        Clicks on the apply link are counted and shown on the card. Salary
        information appears only when the employer supplies a complete range;
        missing salary details are never filled with an estimate.
      </p>
      <p>
        <a href="/rules">Read the rules</a> for ranking, bid limits, raises,
        the rolling seven-day window, and link standards.
      </p>
    </main>
  );
}

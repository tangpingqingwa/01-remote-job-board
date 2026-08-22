import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Remote Job Board",
  description:
    "Weekly public auction for the #1 remote job in a function lane. Rank is the bid.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <a className="logo" href="/">
              remote<span>.</span>jobs
            </a>
            <nav className="site-nav" aria-label="Main">
              <ul>
                <li>
                  <a href="/" aria-current="page">
                    Leaderboard
                  </a>
                </li>
                <li>
                  <a href="/about">About</a>
                </li>
                <li>
                  <a href="/rules">Rules</a>
                </li>
              </ul>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}

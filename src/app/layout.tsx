import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SearchPopover } from "../components/search-popover";
import { ThemeToggle } from "../components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Remote jobs · Hiring wall",
  description:
    "Remote jobs ranked by bid in a rolling seven-day placement window.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <header className="site-header" data-slot="site-header">
          <div className="site-header-inner" data-slot="shell">
            <a
              className="logo"
              href="/"
              aria-label="Remote jobs hiring wall"
              data-slot="brand"
            >
              <span className="logo-word">
                remote<span className="logo-dot">.</span>jobs
              </span>
            </a>
            <nav className="site-nav" aria-label="Main" data-slot="primary-nav">
              <ul>
                <li>
                  <a className="nav-leaderboard" href="/" aria-current="page">
                    Leaderboard
                  </a>
                </li>
                <li>
                  <span className="nav-static" aria-disabled="true">
                    Daily
                  </span>
                </li>
                <li>
                  <a href="/#function-rail">Categories</a>
                </li>
                <li>
                  <a href="/about">About</a>
                </li>
                <li>
                  <a className="nav-rules" href="/rules">
                    Rules
                  </a>
                </li>
                <li>
                  <SearchPopover />
                </li>
                <li>
                  <ThemeToggle />
                </li>
              </ul>
            </nav>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="site-footer-copy">
            <span>Remote jobs hiring wall · global, English, USD</span>
            <span className="site-footer-maker" data-maker-contact>
              Built by <a href="mailto:tangpingqingwa@gmail.com">tangpingqingwa@gmail.com</a>
            </span>
          </div>
          <nav aria-label="Footer">
            <a href="/rules">Rules</a>
            <a href="/about">About</a>
          </nav>
        </footer>
      </body>
    </html>
  );
}

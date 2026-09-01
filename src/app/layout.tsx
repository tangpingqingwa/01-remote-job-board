import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SearchPopover } from "../components/search-popover";
import { ThemeToggle } from "../components/theme-toggle";
import "./globals.css";

const SITE_URL = "https://remotejobs.lol";
const SITE_NAME = "Remote Jobs";
const SITE_DESCRIPTION =
  "Discover remote jobs in a transparent rolling seven-day placement window and hiring wall. Employers bid in USD for placement; rank is the bid.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Remote Jobs — Paid Hiring Wall",
    template: "%s | Remote Jobs",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["remote jobs", "remote work", "hiring board", "paid job listings"],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/brand-mark.svg", type: "image/svg+xml" }],
    shortcut: "/brand-mark.svg",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "Remote Jobs — Paid Hiring Wall",
    description: SITE_DESCRIPTION,
    images: [{ url: "/brand-mark.png", width: 512, height: 512, alt: "Remote Jobs hiring wall" }],
  },
  twitter: {
    card: "summary",
    title: "Remote Jobs — Paid Hiring Wall",
    description: SITE_DESCRIPTION,
    images: ["/brand-mark.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  inLanguage: "en",
  isAccessibleForFree: true,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      </head>
      <body>
        <header className="site-header" data-slot="site-header">
          <div className="site-header-inner" data-slot="shell">
            <a
              className="logo"
              href="/"
              aria-label="Remote jobs hiring wall"
              data-slot="brand"
            >
              <img
                className="brand-mark"
                src="/brand-mark.svg"
                width="28"
                height="28"
                alt=""
                aria-hidden="true"
              />
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

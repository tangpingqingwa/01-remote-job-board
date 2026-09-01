"use client";

import { useEffect, useId, useRef, useState } from "react";

export type SearchListing = {
  id: string;
  title: string;
  company: string;
  text: string;
  href?: string;
};

export function searchListings(
  listings: readonly SearchListing[],
  query: string,
): SearchListing[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...listings];

  return listings.filter((listing) =>
    [listing.title, listing.company, listing.text]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

function readCurrentListings(): SearchListing[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      "[data-listing-card][data-listing-id]",
    ),
  ).flatMap((card) => {
    const id = card.dataset.listingId;
    const title = card.querySelector<HTMLElement>(".title")?.textContent?.trim();
    const company = card
      .querySelector<HTMLElement>("[data-company]")
      ?.textContent?.trim();
    if (!id || !title || !company) return [];

    const applyLink = card.querySelector<HTMLAnchorElement>(
      "a[data-apply-url][href^='/']",
    );
    return [
      {
        id,
        title,
        company,
        text: card.textContent?.replace(/\s+/g, " ").trim() ?? "",
        ...(applyLink?.getAttribute("href")
          ? { href: applyLink.getAttribute("href") ?? undefined }
          : {}),
      },
    ];
  });
}

export function SearchPopover() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [listings, setListings] = useState<SearchListing[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId().replace(/:/g, "");
  const panelId = `search-panel-${id}`;
  const inputId = `search-input-${id}`;
  const matches = searchListings(listings, query);

  function focusTrigger() {
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function closeSearch() {
    setOpen(false);
    focusTrigger();
  }

  useEffect(() => {
    if (!open) return;

    setListings(readCurrentListings());
    setQuery("");
    const focusFrame = window.requestAnimationFrame(() => inputRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeSearch();
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) closeSearch();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return (
    <div
      className="search-popover"
      ref={rootRef}
      role="search"
      aria-label="Search remote jobs"
      data-search-popover=""
    >
      <button
        className="icon-button search-button"
        type="button"
        ref={triggerRef}
        aria-label="Search remote jobs"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => (open ? closeSearch() : setOpen(true))}
      >
        Find
      </button>
      {open ? (
        <div
          className="search-panel"
          id={panelId}
          role="dialog"
          aria-label="Search results"
          data-search-panel=""
        >
          <div className="search-panel-heading">
            <label htmlFor={inputId}>Search paid remote jobs</label>
            <button
              className="search-close"
              type="button"
              onClick={closeSearch}
            >
              Close
            </button>
          </div>
          <input
            ref={inputRef}
            id={inputId}
            className="search-input"
            type="search"
            role="searchbox"
            value={query}
            placeholder="Title, company, or lane"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <p className="search-status" aria-live="polite">
            {query.trim()
              ? `${matches.length} matching paid ${matches.length === 1 ? "role" : "roles"}`
              : `${listings.length} paid ${listings.length === 1 ? "role" : "roles"} on this page`}
          </p>
          {matches.length > 0 ? (
            <ul className="search-results">
              {matches.map((listing) => (
                <li key={listing.id}>
                  {listing.href ? (
                    <a className="search-result" href={listing.href}>
                      <strong>{listing.title}</strong>
                      <span>{listing.company}</span>
                    </a>
                  ) : (
                    <div className="search-result search-result-static">
                      <strong>{listing.title}</strong>
                      <span>{listing.company}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="search-empty" data-search-empty="">
              {query.trim()
                ? "No matching paid remote jobs on this page."
                : "No paid remote jobs are visible on this page."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

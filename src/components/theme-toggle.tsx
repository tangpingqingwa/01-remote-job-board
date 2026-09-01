"use client";

import { useEffect, useState } from "react";

const THEME_KEY = "remote-jobs-theme";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false;
    const nextDark = stored === "dark" || (stored === null && prefersDark);
    document.documentElement.classList.toggle("dark", nextDark);
    setDark(nextDark);
  }, []);

  function toggleTheme() {
    const nextDark = !dark;
    document.documentElement.classList.toggle("dark", nextDark);
    window.localStorage.setItem(THEME_KEY, nextDark ? "dark" : "light");
    setDark(nextDark);
  }

  return (
    <button
      className="icon-button theme-toggle"
      type="button"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggleTheme}
    >
      Theme
    </button>
  );
}

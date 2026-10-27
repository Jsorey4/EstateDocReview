import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
const KEY = "estate-review.theme";
export default function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) return saved === "dark";
    } catch {
      /* Storage is optional. */
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem(KEY, dark ? "dark" : "light");
    } catch {
      /* Keep the in-memory choice. */
    }
  }, [dark]);
  return (
    <button
      className="button secondary theme-toggle"
      aria-pressed={dark}
      aria-label="Dark mode"
      onClick={() => setDark(!dark)}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
      <span>{dark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}

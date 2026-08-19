import { useEffect, useState } from "react";
import { ChatKitPanel } from "./components/ChatKitPanel";

type Theme = "light" | "dark";

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme");

    if (saved === "light" || saved === "dark") {
      return saved;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.colorScheme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          ChatKit
        </h1>

        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? "☀ Light" : "🌙 Dark"}
        </button>
      </header>

      <div className="min-h-0 flex-1 w-full">
      	<ChatKitPanel theme={theme} />
      </div>
    </main>
  );
}

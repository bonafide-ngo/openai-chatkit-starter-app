import { useEffect, useState } from "react";
import { ChatKitPanel } from "./components/ChatKitPanel";
import {
  CHATKIT_DELETE_ALL_URL,
  UI_LABELS,
} from "./lib/config";

type Theme = "light" | "dark";
type ChatMode = "persistent" | "temporary";

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
  const [chatMode, setChatMode] = useState<ChatMode>("persistent");
  const [persistentThreadId, setPersistentThreadId] = useState<string | null>(
    () => localStorage.getItem("chatkit-persistent-thread"),
  );

  useEffect(() => {
    document.documentElement.dataset.colorScheme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  const deleteAllHistory = async () => {
    if (!window.confirm(`${UI_LABELS.deleteAll} chat history and local files?`)) {
      return;
    }

    const response = await fetch(CHATKIT_DELETE_ALL_URL, { method: "DELETE" });
    if (!response.ok) {
      window.alert("Unable to delete chat history.");
      return;
    }

    localStorage.removeItem("chatkit-persistent-thread");
    window.location.reload();
  };

  const handleThreadChange = (threadId: string | null) => {
    if (chatMode === "persistent") {
      setPersistentThreadId(threadId);
      if (threadId) {
        localStorage.setItem("chatkit-persistent-thread", threadId);
      } else {
        localStorage.removeItem("chatkit-persistent-thread");
      }
    }
  };

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          ChatKit
        </h1>

        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <span>{UI_LABELS.temporary}</span>
            <input
              type="checkbox"
              checked={chatMode === "temporary"}
              onChange={(event) => {
                setChatMode(event.target.checked ? "temporary" : "persistent");
              }}
              className="peer sr-only"
              aria-label="Use temporary chat without history"
            />
            <span className="relative h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-amber-500 peer-checked:[&>span]:translate-x-5 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber-500 dark:bg-slate-700">
              <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform" />
            </span>
          </label>

          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label={`${UI_LABELS.switchTo} ${theme === "dark" ? UI_LABELS.light : UI_LABELS.dark}`}
          >
            {theme === "dark" ? `☀ ${UI_LABELS.light}` : `🌙 ${UI_LABELS.dark}`}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 w-full">
        <ChatKitPanel
          theme={theme}
          mode="persistent"
          active={chatMode === "persistent"}
          initialThread={persistentThreadId}
          onThreadChange={handleThreadChange}
          onDeleteAll={deleteAllHistory}
        />
        <ChatKitPanel
          theme={theme}
          mode="temporary"
          active={chatMode === "temporary"}
          initialThread={null}
          onThreadChange={() => undefined}
          onDeleteAll={deleteAllHistory}
        />
      </div>
    </main >
  );
}

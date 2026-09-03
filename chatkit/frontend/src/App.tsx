import { useEffect, useRef, useState } from "react";
import { ChatKitPanel } from "./components/ChatKitPanel";
import { KnowledgeBasePanel } from "./components/KnowledgeBasePanel";
import { MCPPanel } from "./components/MCPPanel";
import {
  CHATKIT_DELETE_ALL_URL,
  CHATKIT_API_URL,
  CHATKIT_TEMPORARY_API_URL,
  CHATKIT_LOCALE,
  AUTH_GATE_LABELS,
  EXPORT_UI_LABELS,
  LANGUAGE_NAMES,
  MISSING_THREAD_MESSAGES,
  SUPPORTED_APP_LOCALES,
  setChatkitLocale,
  SIGN_OUT_LABELS,
  UI_LABELS,
} from "./lib/config";

type Theme = "light" | "dark";
type ChatMode = "persistent" | "temporary";
type Session = { user?: { id?: string; name?: string | null; email?: string | null } } | null;

export default function App() {
  const [session, setSession] = useState<Session | undefined>(undefined);
  const [maintenance, setMaintenance] = useState<boolean | undefined>(undefined);
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
    null,
  );
  const [temporaryThreadId, setTemporaryThreadId] = useState<string | null>(null);
  const [knowledgeBaseOpen, setKnowledgeBaseOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    void Promise.all([
      fetch("/health").then((response) => (response.ok ? response.json() : { maintenance: false })),
      fetch("/api/auth/session").then((response) => (response.ok ? response.json() : null)),
    ])
      .then(([health, value]) => {
        setMaintenance(Boolean((health as { maintenance?: boolean }).maintenance));
        setSession(value as Session);
        const userId = (value as Session)?.user?.email?.trim().toLowerCase();
        setPersistentThreadId(
          userId ? localStorage.getItem(`chatkit-persistent-thread:${userId}`) : null,
        );
      })
      .catch(() => {
        setMaintenance(false);
        setSession(null);
      });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.colorScheme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const closeAccountMenu = (event: Event) => {
      const accountMenu = accountMenuRef.current;
      if (accountMenu?.open && event.target instanceof Node && !accountMenu.contains(event.target)) {
        accountMenu.open = false;
      }
    };

    window.addEventListener("pointerdown", closeAccountMenu, true);
    return () => window.removeEventListener("pointerdown", closeAccountMenu, true);
  }, []);

  if (session === undefined || maintenance === undefined) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-700">{(AUTH_GATE_LABELS[CHATKIT_LOCALE] ?? AUTH_GATE_LABELS.en).loading}</main>;
  }

  if (maintenance) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-center text-slate-700"><p className="max-w-md text-lg">{(AUTH_GATE_LABELS[CHATKIT_LOCALE] ?? AUTH_GATE_LABELS.en).maintenance}</p></main>;
  }

  if (!session?.user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-slate-900">
        <section className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
          <h1 className="text-2xl font-semibold">ChatKit</h1>
          <p className="mt-2 text-sm text-slate-600">{(AUTH_GATE_LABELS[CHATKIT_LOCALE] ?? AUTH_GATE_LABELS.en).description}</p>
          <a className="mt-6 block rounded-lg bg-slate-900 px-4 py-3 text-center text-sm font-medium text-white hover:bg-slate-700" href="/api/auth/signin">{(AUTH_GATE_LABELS[CHATKIT_LOCALE] ?? AUTH_GATE_LABELS.en).signIn}</a>
        </section>
      </main>
    );
  }

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

    const userKey = session.user?.email?.trim().toLowerCase();
    if (userKey) {
      localStorage.removeItem(`chatkit-persistent-thread:${userKey}`);
    }
    window.location.reload();
  };

  const handleThreadChange = (threadId: string | null) => {
    if (chatMode === "persistent") {
      setPersistentThreadId(threadId);
      const userKey = session.user?.email?.trim().toLowerCase();
      const storageKey = userKey
        ? `chatkit-persistent-thread:${userKey}`
        : null;
      if (threadId) {
        if (storageKey) localStorage.setItem(storageKey, threadId);
      } else if (storageKey) {
        localStorage.removeItem(storageKey);
      }
    }
  };

  const handlePersistentChatkitError = () => {
    window.alert(MISSING_THREAD_MESSAGES[CHATKIT_LOCALE] ?? MISSING_THREAD_MESSAGES.en);
    const userKey = session.user?.email?.trim().toLowerCase();
    if (userKey) {
      localStorage.removeItem(`chatkit-persistent-thread:${userKey}`);
    }
    setPersistentThreadId(null);
  };

  const activeThreadId = chatMode === "persistent" ? persistentThreadId : temporaryThreadId;

  const exportThread = async (format: "pdf" | "docx" | "md") => {
    if (!activeThreadId) return;
    const baseUrl = chatMode === "temporary" ? CHATKIT_TEMPORARY_API_URL : CHATKIT_API_URL;
    const response = await fetch(`${baseUrl}/threads/${encodeURIComponent(activeThreadId)}/export/${format}?locale=${CHATKIT_LOCALE}`);
    if (!response.ok) {
      window.alert(EXPORT_UI_LABELS.exportFailed);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chat-${activeThreadId}.${format}`;
    link.click();
    URL.revokeObjectURL(url);
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
            onClick={() => setKnowledgeBaseOpen(true)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {UI_LABELS.files}
          </button>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <select
              value={CHATKIT_LOCALE}
              onChange={(event) => {
                setChatkitLocale(event.target.value as typeof CHATKIT_LOCALE);
                window.location.reload();
              }}
              aria-label="Language"
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {SUPPORTED_APP_LOCALES.map((locale) => (
                <option key={locale} value={locale}>{LANGUAGE_NAMES[locale]}</option>
              ))}
            </select>
          </label>

          <select
            defaultValue=""
            onChange={(event) => {
              const format = event.target.value as "pdf" | "docx" | "md" | "";
              event.currentTarget.value = "";
              if (format) void exportThread(format);
            }}
            disabled={!activeThreadId}
            aria-label={EXPORT_UI_LABELS.exportChat}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <option value="">{EXPORT_UI_LABELS.exportChat}</option>
            <option value="pdf">{EXPORT_UI_LABELS.exportPdf}</option>
            <option value="docx">{EXPORT_UI_LABELS.exportDocx}</option>
            <option value="md">MD</option>
          </select>

          <details ref={accountMenuRef} className="relative">
            <summary className="cursor-pointer list-none rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
              <span className="max-w-52 truncate align-middle">{session.user?.email ?? "Account"}</span>
              <span aria-hidden="true" className="ml-2">⌄</span>
            </summary>
            <div className="absolute right-0 z-10 mt-2 min-w-full rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => {
                  setMcpOpen(true);
                  if (accountMenuRef.current) accountMenuRef.current.open = false;
                }}
                className="w-full whitespace-nowrap rounded-md px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span aria-hidden="true" className="mr-2">⚙</span>
                MCP
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                className="w-full whitespace-nowrap rounded-md px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                aria-label={`${UI_LABELS.switchTo} ${theme === "dark" ? UI_LABELS.light : UI_LABELS.dark}`}
              >
                {theme === "dark" ? `☀ ${UI_LABELS.light}` : `🌙 ${UI_LABELS.dark}`}
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = "/api/auth/signout";
                }}
                className="w-full whitespace-nowrap rounded-md bg-amber-400 px-3 py-2 text-left text-sm font-medium text-amber-950 transition hover:bg-amber-500 dark:bg-amber-500 dark:hover:bg-amber-400"
              >
                {SIGN_OUT_LABELS[CHATKIT_LOCALE] ?? SIGN_OUT_LABELS.en}
              </button>
            </div>
          </details>
        </div>
      </header>

      <div
        className="relative min-h-0 flex-1 w-full"
        onMouseEnter={() => {
          if (accountMenuRef.current?.open) {
            accountMenuRef.current.open = false;
          }
        }}
      >
        <ChatKitPanel
          theme={theme}
          mode="persistent"
          active={chatMode === "persistent"}
          initialThread={persistentThreadId}
          onThreadChange={handleThreadChange}
          onChatkitError={handlePersistentChatkitError}
          onDeleteAll={deleteAllHistory}
        />
        <ChatKitPanel
          theme={theme}
          mode="temporary"
          active={chatMode === "temporary"}
          initialThread={null}
          onThreadChange={setTemporaryThreadId}
          onDeleteAll={deleteAllHistory}
        />
        <KnowledgeBasePanel
          open={knowledgeBaseOpen}
          onClose={() => setKnowledgeBaseOpen(false)}
        />
        <MCPPanel
          open={mcpOpen}
          storageKey={session.user?.email?.trim().toLowerCase() ? `chatkit-mcp-settings:${session.user.email.trim().toLowerCase()}` : null}
          configUrl={`${CHATKIT_API_URL.replace(/\/$/, "")}/mcp/config`}
          onClose={() => setMcpOpen(false)}
        />
      </div>
    </main >
  );
}

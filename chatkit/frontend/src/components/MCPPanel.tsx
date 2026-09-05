import { useEffect, useState } from "react";
import { CHATKIT_LOCALE, MCP_LABELS, MCP_RESET_LABELS, UI_LABELS } from "../lib/config";

export type McpTransport = "streamable-http" | "sse" | "stdio";

export type McpSettings = {
    enabled: boolean;
    name: string;
    transport: McpTransport;
    url: string;
    command: string;
    arguments: string;
    authToken: string;
};

const DEFAULT_SETTINGS: McpSettings = {
    enabled: false,
    name: "",
    transport: "streamable-http",
    url: "",
    command: "",
    arguments: "",
    authToken: "",
};

interface MCPPanelProps {
    open: boolean;
    storageKey: string | null;
    configUrl: string;
    onClose: () => void;
}

export function MCPPanel({ open, storageKey, configUrl, onClose }: MCPPanelProps) {
    const [settings, setSettings] = useState<McpSettings>(DEFAULT_SETTINGS);
    const [saved, setSaved] = useState(false);
    const [toggleBusy, setToggleBusy] = useState(false);

    useEffect(() => {
        if (!open || !storageKey) return;
        fetch(configUrl)
            .then(async (response) => {
                if (!response.ok) throw new Error("Unable to load MCP settings");
                return response.json() as Promise<Partial<McpSettings>>;
            })
            .then((config) => setSettings({ ...DEFAULT_SETTINGS, ...config }))
            .catch(() => {
                const stored = localStorage.getItem(storageKey);
                if (!stored) return;
                try {
                    setSettings({ ...DEFAULT_SETTINGS, ...(JSON.parse(stored) as Partial<McpSettings>) });
                } catch {
                    setSettings(DEFAULT_SETTINGS);
                }
            });
    }, [configUrl, open, storageKey]);

    const update = <K extends keyof McpSettings>(key: K, value: McpSettings[K]) => {
        setSaved(false);
        setSettings((current) => ({ ...current, [key]: value }));
    };

    const save = async () => {
        if (!storageKey) return;
        localStorage.setItem(storageKey, JSON.stringify(settings));
        const response = await fetch(configUrl, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(settings),
        });
        setSaved(response.ok);
    };

    const toggleEnabled = async (enabled: boolean) => {
        if (!storageKey || toggleBusy) return;
        const nextSettings = { ...settings, enabled };
        // Optimistically update the switch, then restore the previous state if the
        // server rejects the change so the UI cannot drift from persisted config.
        setSettings(nextSettings);
        setToggleBusy(true);
        try {
            const response = await fetch(configUrl, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(nextSettings),
            });
            if (!response.ok) throw new Error("Unable to update MCP state");
            localStorage.setItem(storageKey, JSON.stringify(nextSettings));
            setSaved(true);
        } catch {
            setSettings(settings);
            setSaved(false);
        } finally {
            setToggleBusy(false);
        }
    };

    const reset = async () => {
        if (!storageKey || toggleBusy) return;
        setToggleBusy(true);
        try {
            // Reset server state first, then mirror the server-provided defaults in
            // local storage rather than assuming the client defaults are authoritative.
            const response = await fetch(configUrl, { method: "DELETE" });
            if (!response.ok) throw new Error("Unable to reset MCP settings");
            const defaults = await fetch(configUrl).then((result) => result.json() as Promise<Partial<McpSettings>>);
            const nextSettings = { ...DEFAULT_SETTINGS, ...defaults };
            setSettings(nextSettings);
            localStorage.setItem(storageKey, JSON.stringify(nextSettings));
            setSaved(true);
        } catch {
            setSaved(false);
        } finally {
            setToggleBusy(false);
        }
    };

    if (!open) return null;

    const usesLocalProcess = settings.transport === "stdio";

    return (
        <aside className="absolute right-0 top-0 z-20 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
                <div>
                    <h2 className="font-semibold text-slate-900 dark:text-slate-100">MCP</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{MCP_LABELS.description}</p>
                </div>
                <button type="button" onClick={onClose} className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600">{UI_LABELS.close}</button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
                <label className="flex items-center justify-between rounded border border-slate-200 p-3 text-sm dark:border-slate-700">
                    <span>
                        <span className="block font-medium text-slate-800 dark:text-slate-100">{MCP_LABELS.enable}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{MCP_LABELS.enableDescription}</span>
                    </span>
                    <input type="checkbox" checked={settings.enabled} onChange={(event) => void toggleEnabled(event.target.checked)} disabled={toggleBusy} className="peer sr-only" />
                    <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${settings.enabled ? "bg-amber-500" : "bg-slate-300 dark:bg-slate-700"}`}>
                        <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${settings.enabled ? "translate-x-5" : ""}`} />
                    </span>
                </label>

                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {MCP_LABELS.serverName}
                    <input value={settings.name} onChange={(event) => update("name", event.target.value)} placeholder={MCP_LABELS.serverNamePlaceholder} className="mt-1 w-full rounded border border-slate-300 bg-white p-2 font-normal dark:border-slate-600 dark:bg-slate-800" />
                </label>

                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {MCP_LABELS.transport}
                    <select value={settings.transport} onChange={(event) => update("transport", event.target.value as McpTransport)} className="mt-1 w-full rounded border border-slate-300 bg-white p-2 font-normal dark:border-slate-600 dark:bg-slate-800">
                        <option value="streamable-http">{MCP_LABELS.streamableHttp}</option>
                        <option value="sse">{MCP_LABELS.sse}</option>
                        <option value="stdio">{MCP_LABELS.stdio}</option>
                    </select>
                </label>

                {usesLocalProcess ? (
                    <>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {MCP_LABELS.command}
                            <input value={settings.command} onChange={(event) => update("command", event.target.value)} placeholder={MCP_LABELS.commandPlaceholder} className="mt-1 w-full rounded border border-slate-300 bg-white p-2 font-normal dark:border-slate-600 dark:bg-slate-800" />
                        </label>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {MCP_LABELS.arguments}
                            <input value={settings.arguments} onChange={(event) => update("arguments", event.target.value)} placeholder={MCP_LABELS.argumentsPlaceholder} className="mt-1 w-full rounded border border-slate-300 bg-white p-2 font-normal dark:border-slate-600 dark:bg-slate-800" />
                        </label>
                    </>
                ) : (
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {MCP_LABELS.serverUrl}
                        <input type="url" value={settings.url} onChange={(event) => update("url", event.target.value)} placeholder={MCP_LABELS.serverUrlPlaceholder} className="mt-1 w-full rounded border border-slate-300 bg-white p-2 font-normal dark:border-slate-600 dark:bg-slate-800" />
                    </label>
                )}

                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {MCP_LABELS.bearerToken}
                    <input type="password" value={settings.authToken} onChange={(event) => update("authToken", event.target.value)} placeholder={MCP_LABELS.optional} autoComplete="off" className="mt-1 w-full rounded border border-slate-300 bg-white p-2 font-normal dark:border-slate-600 dark:bg-slate-800" />
                </label>

                <p className="text-xs text-slate-500 dark:text-slate-400">{MCP_LABELS.localStorageNotice}</p>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 p-4 dark:border-slate-700">
                {saved && <span className="text-xs text-slate-500 dark:text-slate-400">{MCP_LABELS.saved}</span>}
                <button type="button" onClick={() => void reset()} disabled={!storageKey || toggleBusy} className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">{MCP_RESET_LABELS[CHATKIT_LOCALE] ?? MCP_RESET_LABELS.en}</button>
                <button type="button" onClick={() => void save()} disabled={!storageKey || toggleBusy} className="rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">{MCP_LABELS.saveSettings}</button>
            </div>
        </aside>
    );
}
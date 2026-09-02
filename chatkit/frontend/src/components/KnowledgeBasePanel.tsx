import { useEffect, useState } from "react";
import { KNOWLEDGE_BASE_URL, UI_LABELS } from "../lib/config";

type VectorStore = { id: string; name: string };
type KnowledgeFile = {
    id: string;
    filename: string;
    status: string;
    created_at: number;
    bytes: number | null;
};
type Attachment = { type: "file" | "image"; id: string; name: string; mime_type: string; preview_url?: string };

interface KnowledgeBasePanelProps {
    open: boolean;
    onClose: () => void;
    onUseLocally: (file: File) => Promise<Attachment>;
}

export function KnowledgeBasePanel({ open, onClose, onUseLocally }: KnowledgeBasePanelProps) {
    const [stores, setStores] = useState<VectorStore[]>([]);
    const [selectedStore, setSelectedStore] = useState("");
    const [files, setFiles] = useState<KnowledgeFile[]>([]);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");

    const loadFiles = async (storeId: string) => {
        if (!storeId) {
            setFiles([]);
            return;
        }
        const response = await fetch(`${KNOWLEDGE_BASE_URL}/stores/${encodeURIComponent(storeId)}/files`);
        if (!response.ok) throw new Error(UI_LABELS.unableToLoadFiles);
        const data: unknown = await response.json();
        if (!Array.isArray(data)) throw new Error(UI_LABELS.unableToLoadFiles);
        setFiles(data as KnowledgeFile[]);
    };

    useEffect(() => {
        if (!open) return;
        fetch(`${KNOWLEDGE_BASE_URL}/stores`)
            .then(async (response) => {
                if (!response.ok) throw new Error(UI_LABELS.unableToLoadStores);
                return response.json() as Promise<VectorStore[]>;
            })
            .then((availableStores) => {
                setStores(availableStores);
                setSelectedStore((current) => current || availableStores[0]?.id || "");
            })
            .catch((error: Error) => setMessage(error.message));
    }, [open]);

    useEffect(() => {
        loadFiles(selectedStore).catch((error: Error) => setMessage(error.message));
    }, [selectedStore]);

    const chooseFile = (file: File | undefined) => {
        if (file) {
            setMessage("");
            setPendingFile(file);
        }
    };

    const uploadToKnowledgeBase = async () => {
        if (!pendingFile || !selectedStore) return;
        setBusy(true);
        setMessage(UI_LABELS.indexingFile);
        try {
            const body = new FormData();
            body.append("file", pendingFile);
            const response = await fetch(`${KNOWLEDGE_BASE_URL}/stores/${encodeURIComponent(selectedStore)}/files`, {
                method: "POST",
                body,
            });
            if (!response.ok) {
                const errorBody: unknown = await response.json();
                const detail = typeof errorBody === "object" && errorBody !== null && "detail" in errorBody
                    ? String(errorBody.detail)
                    : UI_LABELS.unableToIndexFile;
                throw new Error(detail);
            }
            const result = await response.json() as { replaced: boolean };
            setPendingFile(null);
            setMessage(result.replaced ? UI_LABELS.fileReplaced : UI_LABELS.fileIndexed);
            await loadFiles(selectedStore);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : UI_LABELS.unableToIndexFile);
        } finally {
            setBusy(false);
        }
    };

    const handleUseFileLocally = async () => {
        if (!pendingFile) return;
        setBusy(true);
        try {
            await onUseLocally(pendingFile);
            setPendingFile(null);
            setMessage(UI_LABELS.fileAdded);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : UI_LABELS.unableToAddFile);
        } finally {
            setBusy(false);
        }
    };

    const deleteFile = async (fileId: string) => {
        if (!window.confirm(UI_LABELS.confirmDeleteFile)) return;
        setBusy(true);
        try {
            const response = await fetch(`${KNOWLEDGE_BASE_URL}/stores/${encodeURIComponent(selectedStore)}/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
            if (!response.ok) throw new Error(UI_LABELS.unableToDeleteFile);
            setFiles((currentFiles) => currentFiles.filter((file) => file.id !== fileId));
        } catch (error) {
            setMessage(error instanceof Error ? error.message : UI_LABELS.unableToDeleteFile);
        } finally {
            setBusy(false);
        }
    };

    const deleteAllFiles = async () => {
        if (!files.length || !window.confirm(UI_LABELS.confirmDeleteFiles)) return;
        setBusy(true);
        try {
            const response = await fetch(`${KNOWLEDGE_BASE_URL}/stores/${encodeURIComponent(selectedStore)}/files`, { method: "DELETE" });
            if (!response.ok) throw new Error(UI_LABELS.unableToDeleteFiles);
            setFiles([]);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : UI_LABELS.unableToDeleteFiles);
        } finally {
            setBusy(false);
        }
    };

    if (!open) return null;

    return (
        <aside className="absolute right-0 top-0 z-20 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
                <div>
                    <h2 className="font-semibold text-slate-900 dark:text-slate-100">{UI_LABELS.knowledgeBase}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{UI_LABELS.knowledgeBaseDescription}</p>
                </div>
                <button type="button" onClick={onClose} className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600">{UI_LABELS.close}</button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {UI_LABELS.vectorStore}
                    <select value={selectedStore} onChange={(event) => setSelectedStore(event.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white p-2 font-normal dark:border-slate-600 dark:bg-slate-800">
                        {stores.length === 0 && <option value="">{UI_LABELS.noConfiguredStores}</option>}
                        {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                    </select>
                </label>

                <label className="cursor-pointer rounded border border-dashed border-slate-400 p-3 text-center text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                    {UI_LABELS.chooseFile}
                    <input type="file" className="sr-only" onChange={(event) => chooseFile(event.target.files?.[0])} disabled={busy} />
                </label>

                {pendingFile && (
                    <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/30">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{pendingFile.name}</p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{UI_LABELS.localOrKnowledgeBase}</p>
                        <div className="mt-3 flex gap-2">
                            <button type="button" onClick={() => void handleUseFileLocally()} disabled={busy} className="rounded bg-slate-900 px-3 py-2 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">{UI_LABELS.useLocally}</button>
                            <button type="button" onClick={() => void uploadToKnowledgeBase()} disabled={busy || !selectedStore} className="rounded bg-amber-600 px-3 py-2 text-xs text-white disabled:opacity-50">{UI_LABELS.uploadToKnowledgeBase}</button>
                            <button type="button" onClick={() => setPendingFile(null)} disabled={busy} className="px-2 text-xs text-slate-500">{UI_LABELS.cancel}</button>
                        </div>
                    </div>
                )}

                {message && <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>}

                <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-700">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{UI_LABELS.indexedFiles} ({files.length})</h3>
                    <button type="button" onClick={() => void deleteAllFiles()} disabled={busy || !files.length} className="text-xs text-red-600 disabled:opacity-40">{UI_LABELS.deleteFiles}</button>
                </div>
                <ul className="space-y-2">
                    {files.map((file) => (
                        <li key={file.id} className="flex items-center justify-between gap-3 rounded border border-slate-200 p-3 text-sm dark:border-slate-700">
                            <span className="min-w-0 truncate text-slate-800 dark:text-slate-200" title={file.filename}>{file.filename}<span className="ml-2 text-xs text-slate-500">{file.status}</span></span>
                            <button type="button" onClick={() => void deleteFile(file.id)} disabled={busy} className="shrink-0 text-xs text-red-600 disabled:opacity-40">{UI_LABELS.deleteFile}</button>
                        </li>
                    ))}
                </ul>
            </div>
        </aside>
    );
}

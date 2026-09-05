import { useEffect, useState } from "react";
import { CHATKIT_LOCALE, UI_LABELS, USAGE_LABELS } from "../lib/config";

type UsageMonth = { month: string; tokens: number; billing: number };
type UsageData = {
    billing: number;
    billing_limit: number | null;
    billing_percentage: number;
    billing_currency: string;
    tokens: UsageMonth[];
};

interface UsagePanelProps {
    open: boolean;
    configUrl: string;
    onClose: () => void;
}

const formatTokens = (value: number) => new Intl.NumberFormat(CHATKIT_LOCALE).format(value);
const formatBilling = (value: number, currency: string) => {
    const amount = value.toFixed(2);
    return /^[^\p{L}\p{N}]+$/u.test(currency) ? `${currency}${amount}` : `${amount} ${currency}`;
};

export function UsagePanel({ open, configUrl, onClose }: UsagePanelProps) {
    const [data, setData] = useState<UsageData | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!open) return;
        setFailed(false);
        fetch(configUrl)
            .then(async (response) => {
                if (!response.ok) throw new Error("Unable to load usage");
                return response.json() as Promise<UsageData>;
            })
            .then(setData)
            .catch(() => setFailed(true));
    }, [configUrl, open]);

    if (!open) return null;

    const limit = data?.billing_limit;
    const percentage = Math.min(Math.max(data?.billing_percentage ?? 0, 0), 100);
    const maxTokens = Math.max(...(data?.tokens.map((item) => item.tokens) ?? [0]), 1);
    const maxBilling = Math.max(...(data?.tokens.map((item) => item.billing) ?? [0]), 1);
    const monthFormatter = new Intl.DateTimeFormat(CHATKIT_LOCALE, { month: "short", year: "numeric" });

    return (
        <aside className="absolute right-0 top-0 z-20 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
                <div>
                    <h2 className="font-semibold text-slate-900 dark:text-slate-100">{USAGE_LABELS.usage}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{USAGE_LABELS.description}</p>
                </div>
                <button type="button" onClick={onClose} className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600">{UI_LABELS.close}</button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
                {failed ? <p className="text-sm text-rose-600 dark:text-rose-400">{USAGE_LABELS.unavailable}</p> : data === null ? <p className="text-sm text-slate-500 dark:text-slate-400">{USAGE_LABELS.loading}</p> : (
                    <>
                        <section>
                            <div className="mb-2 flex items-baseline justify-between gap-3">
                                <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100">{USAGE_LABELS.sharedBilling}</h3>
                                <span className="text-2xl font-semibold text-slate-900 dark:text-white">{Math.round(percentage)}%</span>
                            </div>
                            <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100}>
                                <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${percentage}%` }} />
                            </div>
                            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                {limit === null ? "" : `${formatBilling(data.billing, data.billing_currency)} / ${formatBilling(limit, data.billing_currency)}`}
                            </p>
                        </section>

                        <p className="border-l-2 border-amber-400 pl-3 text-xs text-slate-600 dark:text-slate-300">{USAGE_LABELS.resetNotice}</p>

                        <section>
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100">{USAGE_LABELS.tokensByMonth}</h3>
                                <div className="flex gap-3 text-[10px] text-slate-500 dark:text-slate-400">
                                    <span><span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-sm bg-slate-700 dark:bg-amber-500" />{USAGE_LABELS.tokens}</span>
                                    <span><span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-sm bg-sky-500" />{USAGE_LABELS.billing}</span>
                                </div>
                            </div>
                            <div className="flex h-48 items-end gap-2 border-b border-slate-200 px-1 dark:border-slate-700">
                                {data.tokens.map((item) => (
                                    <div key={item.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                                        <div className="flex h-[75%] w-full max-w-14 items-end justify-center gap-0.5">
                                            <div className="flex h-full w-1/2 flex-col items-center justify-end gap-0.5" title={`${formatTokens(item.tokens)} ${USAGE_LABELS.tokens}`} aria-label={`${formatTokens(item.tokens)} ${USAGE_LABELS.tokens}`}>
                                                <span className="max-w-full truncate text-[9px] leading-none text-slate-500 dark:text-slate-400">{formatTokens(item.tokens)}</span>
                                                <div className="w-full rounded-t bg-slate-700 transition-all dark:bg-amber-500" style={{ height: `${Math.max((item.tokens / maxTokens) * 100, item.tokens ? 5 : 0)}%` }} />
                                            </div>
                                            <div className="flex h-full w-1/2 flex-col items-center justify-end gap-0.5" title={formatBilling(item.billing, data.billing_currency)} aria-label={formatBilling(item.billing, data.billing_currency)}>
                                                <span className="max-w-full truncate text-[9px] leading-none text-slate-500 dark:text-slate-400">{formatBilling(item.billing, data.billing_currency)}</span>
                                                <div className="w-full rounded-t bg-sky-500 transition-all" style={{ height: `${Math.max((item.billing / maxBilling) * 100, item.billing ? 5 : 0)}%` }} />
                                            </div>
                                        </div>
                                        <span className="truncate text-[10px] text-slate-500 dark:text-slate-400">{monthFormatter.format(new Date(`${item.month}-01T00:00:00Z`))}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </>
                )}
            </div>
        </aside>
    );
}
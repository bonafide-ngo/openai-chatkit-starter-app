import type { SupportedLocale } from "@openai/chatkit";

const readEnvString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const configuredApiUrl = readEnvString(import.meta.env.VITE_CHATKIT_API_URL);

const isLoopbackUrl = (value: string): boolean => {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
};

export const CHATKIT_API_URL =
  configuredApiUrl && !isLoopbackUrl(configuredApiUrl)
    ? configuredApiUrl
    : "/chatkit";

export const CHATKIT_TEMPORARY_API_URL = CHATKIT_API_URL.replace(
  /\/chatkit\/?$/,
  "/chatkit/temporary",
);

const supportedLocales = new Set<SupportedLocale>([
  "de", "en", "es", "fr", "it", "ja", "ko", "nl", "pl", "pt", "ru", "zh",
]);

export const CHATKIT_LOCALE: SupportedLocale = (() => {
  const language = navigator.language.split("-")[0] as SupportedLocale;
  return supportedLocales.has(language) ? language : "en";
})();

export const CURRENT_UI_LABELS = {
  en: { temporary: "Temporary", light: "Light", dark: "Dark", deleteAll: "Delete all", switchTo: "Switch to" },
  de: { temporary: "Temporär", light: "Hell", dark: "Dunkel", deleteAll: "Alle löschen", switchTo: "Wechseln zu" },
  es: { temporary: "Temporal", light: "Claro", dark: "Oscuro", deleteAll: "Borrar todo", switchTo: "Cambiar a" },
  fr: { temporary: "Temporaire", light: "Clair", dark: "Sombre", deleteAll: "Tout supprimer", switchTo: "Passer en" },
  it: { temporary: "Temporanea", light: "Chiaro", dark: "Scuro", deleteAll: "Elimina tutto", switchTo: "Passa a" },
  ja: { temporary: "一時的", light: "ライト", dark: "ダーク", deleteAll: "すべて削除", switchTo: "切り替え" },
  ko: { temporary: "임시", light: "라이트", dark: "다크", deleteAll: "모두 삭제", switchTo: "전환" },
  nl: { temporary: "Tijdelijk", light: "Licht", dark: "Donker", deleteAll: "Alles verwijderen", switchTo: "Schakel naar" },
  pl: { temporary: "Tymczasowy", light: "Jasny", dark: "Ciemny", deleteAll: "Usuń wszystko", switchTo: "Przełącz na" },
  pt: { temporary: "Temporário", light: "Claro", dark: "Escuro", deleteAll: "Excluir tudo", switchTo: "Mudar para" },
  ru: { temporary: "Временный", light: "Светлая", dark: "Темная", deleteAll: "Удалить все", switchTo: "Переключить на" },
  zh: { temporary: "临时", light: "浅色", dark: "深色", deleteAll: "全部删除", switchTo: "切换到" },
} as const;

export const UI_LABELS = CURRENT_UI_LABELS[CHATKIT_LOCALE as keyof typeof CURRENT_UI_LABELS] ?? CURRENT_UI_LABELS.en;

export const CHATKIT_DELETE_ALL_URL = `${CHATKIT_API_URL.replace(/\/$/, "")}/threads`;

/**
 * ChatKit requires a domain key at runtime. Use the local fallback while
 * developing, and register a production domain key for deployment:
 * https://platform.openai.com/settings/organization/security/domain-allowlist
 */
export const CHATKIT_API_DOMAIN_KEY =
  readEnvString(import.meta.env.VITE_CHATKIT_API_DOMAIN_KEY) ??
  "domain_pk_localhost_dev";

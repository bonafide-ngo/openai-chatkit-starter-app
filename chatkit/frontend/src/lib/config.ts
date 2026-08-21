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

export const CHATKIT_DELETE_ALL_URL = `${CHATKIT_API_URL.replace(/\/$/, "")}/threads`;

/**
 * ChatKit requires a domain key at runtime. Use the local fallback while
 * developing, and register a production domain key for deployment:
 * https://platform.openai.com/settings/organization/security/domain-allowlist
 */
export const CHATKIT_API_DOMAIN_KEY =
  readEnvString(import.meta.env.VITE_CHATKIT_API_DOMAIN_KEY) ??
  "domain_pk_localhost_dev";

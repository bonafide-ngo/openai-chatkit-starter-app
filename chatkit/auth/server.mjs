import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Auth } from "@auth/core";
import { decode } from "@auth/core/jwt";
import Google from "@auth/core/providers/google";
import GitHub from "@auth/core/providers/github";
import MicrosoftEntraID from "@auth/core/providers/microsoft-entra-id";
import Apple from "@auth/core/providers/apple";
import Email from "@auth/core/providers/email";
import Credentials from "@auth/core/providers/credentials";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

const root = path.dirname(fileURLToPath(import.meta.url));
const configPath = process.env.AUTH_CONFIG_FILE || path.join(root, "auth.config.local.json");
if (!existsSync(configPath)) throw new Error(`Create ${configPath} from auth.config.example.json before starting auth.`);
const config = JSON.parse(readFileSync(configPath, "utf8"));
const allowedEmails = new Set((config.allowedEmails || []).map((email) => email.toLowerCase().trim()));
const localUsers = new Map((config.localUsers || []).map((user) => [user.email.toLowerCase(), user]));
const authUsers = new Map([...localUsers.values()].map((user) => {
    const email = user.email.toLowerCase();
    return [email, { id: email, email, name: email }];
}));
const verificationTokens = new Map();
const secret = process.env.AUTH_SECRET;
if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters.");
const publicUrl = process.env.AUTH_PUBLIC_URL || "http://localhost:3000";
const hasEnv = (...names) => names.every((name) => Boolean(process.env[name]?.trim()));
const envBool = (name, defaultValue) => process.env[name] === undefined
    ? defaultValue
    : process.env[name].toLowerCase() === "true";
const emailLinkEnabled = envBool("AUTH_EMAIL_LINK", true);
const localEmailEnabled = envBool("AUTH_EMAIL_LOCAL", true);
const signOutTranslations = {
    en: ["Signout", "Are you sure you want to sign out?", "Sign out"],
    de: ["Abmelden", "Möchten Sie sich wirklich abmelden?", "Abmelden"],
    es: ["Cerrar sesión", "¿Seguro que quieres cerrar sesión?", "Cerrar sesión"],
    fr: ["Déconnexion", "Voulez-vous vraiment vous déconnecter ?", "Se déconnecter"],
    it: ["Disconnessione", "Vuoi davvero disconnetterti?", "Disconnetti"],
    ja: ["サインアウト", "サインアウトしてもよろしいですか？", "サインアウト"],
    ko: ["로그아웃", "로그아웃하시겠습니까?", "로그아웃"],
    nl: ["Uitloggen", "Weet je zeker dat je wilt uitloggen?", "Uitloggen"],
    pl: ["Wylogowanie", "Czy na pewno chcesz się wylogować?", "Wyloguj się"],
    pt: ["Sair", "Tem certeza de que deseja sair?", "Sair"],
    ru: ["Выход", "Вы действительно хотите выйти?", "Выйти"],
    zh: ["退出登录", "确定要退出登录吗？", "退出登录"],
};
const signInTranslations = {
    en: { disposableLink: "Sign in with disposable link", localEmail: "Sign in with credentials", localEmailField: "Email", oauth: "Sign in with" },
    de: { disposableLink: "Mit einem Einmal-Link anmelden", localEmail: "Mit Zugangsdaten anmelden", localEmailField: "E-Mail", oauth: "Anmelden mit" },
    es: { disposableLink: "Iniciar sesión con un enlace de un solo uso", localEmail: "Iniciar sesión con credenciales", localEmailField: "Correo electrónico", oauth: "Iniciar sesión con" },
    fr: { disposableLink: "Se connecter avec un lien à usage unique", localEmail: "Se connecter avec des identifiants", localEmailField: "E-mail", oauth: "Se connecter avec" },
    it: { disposableLink: "Accedi con un link temporaneo", localEmail: "Accedi con le credenziali", localEmailField: "Email", oauth: "Accedi con" },
    ja: { disposableLink: "使い捨てリンクでサインイン", localEmail: "認証情報でサインイン", localEmailField: "メールアドレス", oauth: "次でサインイン" },
    ko: { disposableLink: "일회용 링크로 로그인", localEmail: "자격 증명으로 로그인", localEmailField: "이메일", oauth: "다음으로 로그인" },
    nl: { disposableLink: "Inloggen met een eenmalige link", localEmail: "Inloggen met inloggegevens", localEmailField: "E-mail", oauth: "Inloggen met" },
    pl: { disposableLink: "Zaloguj się przez jednorazowy link", localEmail: "Zaloguj się przy użyciu danych logowania", localEmailField: "E-mail", oauth: "Zaloguj się przez" },
    pt: { disposableLink: "Entrar com um link descartável", localEmail: "Entrar com credenciais", localEmailField: "E-mail", oauth: "Entrar com" },
    ru: { disposableLink: "Войти по одноразовой ссылке", localEmail: "Войти с учетными данными", localEmailField: "Электронная почта", oauth: "Войти через" },
    zh: { disposableLink: "使用一次性链接登录", localEmail: "使用凭据登录", localEmailField: "电子邮件", oauth: "使用以下方式登录" },
};
const supportedAuthLocales = new Set(Object.keys(signInTranslations));

function requestLocale(request) {
    const cookieLocale = request.headers.cookie?.match(/(?:^|;\s*)chatkit-language=([^;]+)/)?.[1];
    if (cookieLocale && supportedAuthLocales.has(decodeURIComponent(cookieLocale))) return decodeURIComponent(cookieLocale);
    for (const language of (request.headers["accept-language"] || "").split(",")) {
        const locale = language.split(";")[0].trim().toLowerCase().split("-")[0];
        if (supportedAuthLocales.has(locale)) return locale;
    }
    return "en";
}
const emailServer = process.env.AUTH_EMAIL_SERVER?.includes("://")
    ? process.env.AUTH_EMAIL_SERVER
    : {
        host: process.env.AUTH_EMAIL_SERVER || "localhost",
        port: Number(process.env.AUTH_EMAIL_PORT || 1025),
        secure: process.env.AUTH_EMAIL_SECURE === "true",
        auth: process.env.AUTH_EMAIL_USERNAME
            ? {
                user: process.env.AUTH_EMAIL_USERNAME,
                pass: process.env.AUTH_EMAIL_PASSWORD || "",
            }
            : undefined,
    };

function verifyPassword(password, encoded) {
    try {
        const storedHash = String(encoded);
        const separator = storedHash.indexOf("$");
        const salt = separator >= 0 ? storedHash.slice(0, separator) : "";
        const expected = separator >= 0 ? storedHash.slice(separator + 1) : storedHash;
        const actual = createHash("sha512").update(salt ? `${salt}$${password}` : password).digest("hex");
        if (!/^[a-f0-9]{128}$/i.test(expected)) return false;
        return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
    } catch { return false; }
}

const providers = [
    ...(hasEnv("AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET")
        ? [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET })]
        : []),
    ...(hasEnv("AUTH_MICROSOFT_ID", "AUTH_MICROSOFT_SECRET")
        ? [MicrosoftEntraID({ clientId: process.env.AUTH_MICROSOFT_ID, clientSecret: process.env.AUTH_MICROSOFT_SECRET, issuer: process.env.AUTH_MICROSOFT_ISSUER })]
        : []),
    ...(hasEnv("AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET")
        ? [GitHub({ clientId: process.env.AUTH_GITHUB_ID, clientSecret: process.env.AUTH_GITHUB_SECRET })]
        : []),
    ...(hasEnv("AUTH_APPLE_ID", "AUTH_APPLE_SECRET")
        ? [Apple({ clientId: process.env.AUTH_APPLE_ID, clientSecret: process.env.AUTH_APPLE_SECRET })]
        : []),
    ...(emailLinkEnabled && hasEnv("AUTH_EMAIL_SERVER", "AUTH_EMAIL_FROM")
        ? [Email({ name: "Disposable link", server: emailServer, from: process.env.AUTH_EMAIL_FROM })]
        : []),
    ...(localEmailEnabled && localUsers.size > 0
        ? [Credentials({
            name: "Email",
            credentials: { email: { label: "Email", type: "email", placeholder: "email@example.com" }, password: { label: "Password", type: "password" } },
            async authorize(credentials) {
                const email = String(credentials?.email || "").toLowerCase().trim();
                const user = localUsers.get(email);
                if (!user || !allowedEmails.has(email) || !verifyPassword(String(credentials?.password || ""), user.passwordHash)) return null;
                return { id: email, email, name: email };
            },
        })]
        : []),
];

const authOptions = {
    trustHost: true, basePath: "/api/auth", secret, providers, session: { strategy: "jwt" },
    adapter: {
        async createUser(user) {
            const email = user.email.toLowerCase();
            const authUser = { ...user, id: user.id || randomUUID(), email };
            authUsers.set(email, authUser);
            return authUser;
        },
        async getUser(id) {
            return [...authUsers.values()].find((user) => user.id === id) || null;
        },
        async getUserByEmail(email) {
            return authUsers.get(email.toLowerCase()) || null;
        },
        async updateUser(user) {
            const existing = [...authUsers.values()].find((entry) => entry.id === user.id);
            const updated = { ...existing, ...user, email: (user.email || existing?.email || "").toLowerCase() };
            authUsers.set(updated.email, updated);
            return updated;
        },
        async createVerificationToken(token) {
            verificationTokens.set(`${token.identifier}:${token.token}`, token);
            return token;
        },
        async useVerificationToken({ identifier, token }) {
            const key = `${identifier}:${token}`;
            const value = verificationTokens.get(key);
            verificationTokens.delete(key);
            return value;
        },
    },
    callbacks: { async signIn({ user }) { return Boolean(user.email && allowedEmails.has(user.email.toLowerCase())); } },
};

const server = createServer(async (request, response) => {
    if (!request.url?.startsWith("/api/auth")) { response.writeHead(404); response.end(); return; }
    if (request.url === "/api/auth/session") {
        const cookies = Object.fromEntries((request.headers.cookie || "").split(";").filter(Boolean).map((part) => {
            const separator = part.indexOf("=");
            return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
        }));
        const token = cookies["authjs.session-token"] || cookies["__Secure-authjs.session-token"];
        const payload = token ? await decode({ token, secret, salt: cookies["__Secure-authjs.session-token"] ? "__Secure-authjs.session-token" : "authjs.session-token" }) : null;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(payload?.email ? { user: { id: payload.sub, name: payload.name, email: payload.email, image: payload.picture } } : null));
        return;
    }
    const body = request.method === "POST" ? await new Promise((resolve, reject) => {
        const chunks = [];
        request.on("data", (chunk) => chunks.push(chunk));
        request.on("end", () => resolve(Buffer.concat(chunks)));
        request.on("error", reject);
    }) : undefined;
    const result = await Auth(new Request(`${publicUrl}${request.url}`, {
        method: request.method,
        headers: request.headers,
        body,
        duplex: "half",
    }), authOptions);
    let responseBody = await result.text();
    if (request.method === "GET" && request.url === "/api/auth/signout" && responseBody.includes("Are you sure you want to sign out?")) {
        const translations = signOutTranslations[requestLocale(request)] || signOutTranslations.en;
        responseBody = responseBody.replaceAll("Signout", translations[0]).replaceAll("Are you sure you want to sign out?", translations[1]).replaceAll("Sign out", translations[2]);
    }
    if (request.method === "GET" && request.url === "/api/auth/signin") {
        const translations = signInTranslations[requestLocale(request)] || signInTranslations.en;
        responseBody = responseBody
            .replace(/(<form action="[^"]*\/signin\/email"[\s\S]*?<button[^>]*>)[\s\S]*?(<\/button>)/, `$1${translations.disposableLink}$2`)
            .replace(/(<form action="[^"]*\/callback\/credentials"[\s\S]*?<button[^>]*>)[\s\S]*?(<\/button>)/, `$1${translations.localEmail}$2`)
            .replaceAll("Sign in with Google", `${translations.oauth} Google`)
            .replaceAll("Sign in with Microsoft Entra ID", `${translations.oauth} Microsoft Entra ID`)
            .replaceAll("Sign in with GitHub", `${translations.oauth} GitHub`)
            .replaceAll("Sign in with Apple", `${translations.oauth} Apple`)
            .replaceAll(">Email<", `>${translations.localEmailField}<`);
    }
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(responseBody);
});
const authPort = Number(process.env.AUTH_PORT || 3001);
server.listen(authPort, "127.0.0.1", () => console.log(`Auth.js listening on http://127.0.0.1:${authPort}`));
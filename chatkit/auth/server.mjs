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
import { createHash, timingSafeEqual } from "node:crypto";

const root = path.dirname(fileURLToPath(import.meta.url));
const configPath = process.env.AUTH_CONFIG_FILE || path.join(root, "auth.config.json");
if (!existsSync(configPath)) throw new Error(`Create ${configPath} from auth.config.example.json before starting auth.`);
const config = JSON.parse(readFileSync(configPath, "utf8"));
const allowedEmails = new Set((config.allowedEmails || []).map((email) => email.toLowerCase().trim()));
const localUsers = new Map((config.localUsers || []).map((user) => [user.email.toLowerCase(), user]));
const verificationTokens = new Map();
const secret = process.env.AUTH_SECRET;
if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters.");
const publicUrl = process.env.AUTH_PUBLIC_URL || "http://localhost:3000";
const hasEnv = (...names) => names.every((name) => Boolean(process.env[name]?.trim()));
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
    ...(hasEnv("AUTH_EMAIL_SERVER", "AUTH_EMAIL_FROM")
        ? [Email({ server: emailServer, from: process.env.AUTH_EMAIL_FROM })]
        : []),
    Credentials({
        name: "Username / password",
        credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
        async authorize(credentials) {
            const email = String(credentials?.email || "").toLowerCase().trim();
            const user = localUsers.get(email);
            if (!user || !allowedEmails.has(email) || !verifyPassword(String(credentials?.password || ""), user.passwordHash)) return null;
            return { id: email, email, name: email };
        },
    }),
];

const authOptions = {
    trustHost: true, basePath: "/api/auth", secret, providers, session: { strategy: "jwt" },
    adapter: {
        async getUserByEmail(email) {
            const user = localUsers.get(email.toLowerCase());
            return user ? { id: email.toLowerCase(), email: email.toLowerCase(), name: email.toLowerCase() } : null;
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
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(await result.text());
});
server.listen(Number(process.env.AUTH_PORT || 3001), "127.0.0.1", () => console.log("Auth.js listening on http://127.0.0.1:3001"));
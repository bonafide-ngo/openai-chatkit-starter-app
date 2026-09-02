import { existsSync, readFileSync, watchFile, unwatchFile } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const authFile = path.join(root, ".env.auth.local");
const legacyEnvFile = path.join(root, ".env.local");
const configFile = process.env.AUTH_CONFIG_FILE || path.join(root, "auth", "auth.config.local.json");
const serverFile = path.join(root, "auth", "server.mjs");

function readAuthEnvironment() {
    const authValues = existsSync(authFile) ? dotenv.parse(readFileSync(authFile)) : {};
    const authEntries = Object.entries(authValues).filter(([key]) => key.startsWith("AUTH_") || key === "CHATKIT_MAINTENANCE");
    const legacyValues = existsSync(legacyEnvFile) ? dotenv.parse(readFileSync(legacyEnvFile)) : {};
    const environment = Object.fromEntries(authEntries);
    if (legacyValues.CHATKIT_MAINTENANCE !== undefined && environment.CHATKIT_MAINTENANCE === undefined) {
        environment.CHATKIT_MAINTENANCE = legacyValues.CHATKIT_MAINTENANCE;
    }
    if (authEntries.length > 0) return environment;
    return Object.fromEntries(Object.entries(legacyValues).filter(([key]) => key.startsWith("AUTH_") || key === "CHATKIT_MAINTENANCE"));
}

let child;
let restarting = false;

function start() {
    child = spawn(process.execPath, [serverFile], {
        cwd: root,
        env: { ...process.env, ...readAuthEnvironment() },
        stdio: "inherit",
    });
    child.on("exit", (code, signal) => {
        if (!restarting && code !== 0) process.exit(code ?? 1);
        if (!restarting && signal) process.exit(1);
    });
}

function restart() {
    if (restarting) return;
    restarting = true;
    console.log("Authentication configuration changed; restarting Auth.js ...");
    child.once("exit", () => {
        restarting = false;
        start();
    });
    child.kill("SIGTERM");
}

start();
for (const watchedFile of [authFile, configFile]) {
    watchFile(watchedFile, { interval: 500 }, (current, previous) => {
        if (current.mtimeMs !== previous.mtimeMs) restart();
    });
}

function shutdown(signal) {
    unwatchFile(authFile);
    unwatchFile(configFile);
    child?.kill(signal);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
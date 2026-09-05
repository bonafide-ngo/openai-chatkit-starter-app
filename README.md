# OpenAI ChatKit Starter

A self-hosted ChatKit example with a React frontend, FastAPI backend, and
server-only Auth.js service. The backend keeps conversation state locally and
uses the OpenAI Agents SDK for responses, web search, code execution, file
analysis, hosted file search, and optional MCP tools.

## Features

- Streaming assistant responses
- Web search and code interpreter tools
- Image and document uploads
- Configurable vector-store knowledge bases
- Optional Model Context Protocol (MCP) integration
- Automatic thread titles
- Light and dark themes
- PDF, DOCX, Markdown, and plain TXT conversation exports
- Per-user usage and billing dashboard
- Persistent local chat history
- Temporary chats without history
- Per-thread and delete-all history controls

## Run It

From a fresh checkout, create the local configuration files:

```bash
cd chatkit
cp .env.example .env.local
cp .env.auth.example .env.auth.local
cp auth/auth.config.example.json auth/auth.config.local.json
```

Set `OPENAI_API_KEY` in `.env.local` and set `AUTH_SECRET` plus
`AUTH_INTERNAL_SECRET` to random values of at least 32 characters in
`.env.auth.local`. Configure at least one authentication method in the auth
environment or add an allowed local user to `auth/auth.config.local.json`; the
detailed options are in the [ChatKit guide](chatkit/README.md).

Then install dependencies and start the application:

```bash
npm install --no-audit
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The command starts three
services: Auth.js on port `3001`, the FastAPI backend on port `8000`, and the
Vite frontend on port `3000`. The frontend waits for the backend before
starting, so the first ChatKit request does not race backend startup.

The backend startup script creates `backend/.venv`, installs the backend
package, and loads `.env.local` plus `.env.auth.local`. The frontend uses the
Vite proxy for local backend and Auth.js requests.

See the [ChatKit guide](chatkit/README.md) for configuration, storage, file
uploads, and deployment notes.

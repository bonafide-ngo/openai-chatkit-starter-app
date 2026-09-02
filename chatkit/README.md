# ChatKit Starter

React and Vite frontend paired with a FastAPI backend. The backend uses the
OpenAI Agents SDK with ChatKit for streaming responses, web search, code
interpreter sessions, and file analysis.

## Quick Start

```bash
npm install
npm run dev
```

The frontend is available at `http://localhost:3000`. The backend runs at
`http://127.0.0.1:8000`. `npm run dev` waits for the backend health endpoint
before starting Vite.

The backend startup script creates `backend/.venv` and installs dependencies.
Set `OPENAI_API_KEY` before starting the app, or place it in
`chatkit/.env.local`.

### Authentication

Authentication runs in the server-only Auth.js service on port `3001`. Copy
`auth/auth.config.example.json` to `auth/auth.config.json` and replace the
allowlist with the emails that may sign in. This file is ignored by Git and is
never loaded by Vite. OAuth credentials and `AUTH_SECRET` belong in `.env.local`.

Add local email/password accounts under `localUsers`; each entry contains only
`email` and `passwordHash`.

`AUTH_PUBLIC_URL` is the browser-facing URL used for Auth.js redirects. Keep it
at `http://localhost:3000` for local Vite development; `AUTH_PORT` remains the
internal Auth.js listening port.

Auth.js exposes Google, Microsoft Entra ID, GitHub, Apple, email magic links,
and email/password credentials. Configure the OAuth callback URLs as
`http://localhost:3000/api/auth/callback/<provider>` in development. Magic
Set `AUTH_EMAIL_SERVER` to the SMTP hostname and `AUTH_EMAIL_PORT` to its port,
with `AUTH_EMAIL_SECURE=true` for TLS. Optional `AUTH_EMAIL_USERNAME` and
`AUTH_EMAIL_PASSWORD` configure SMTP authentication. A complete SMTP URL is
also accepted in `AUTH_EMAIL_SERVER` for compatibility.

To create a password hash for `localUsers`, run:

```bash
node -e 'const crypto=require("crypto"); const salt=crypto.randomBytes(16).toString("hex"); console.log(`${salt}$${crypto.createHash("sha512").update(`${salt}$${process.argv[1]}`).digest("hex")}`)' 'your-password'
```

The server also accepts an unsalted SHA-512 digest for compatibility with
existing local users, but new entries should use the salted format above.

## Configuration

Copy `.env.example` to `.env.local` and update the values as needed:

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | none | Backend authentication with OpenAI. |
| `OPENAI_MODEL` | `gpt-5.6-luna` | Agent model name. |
| `OPENAI_AGENT_INSTRUCTIONS` | built-in assistant prompt | System instructions passed to the assistant. |
| `OPENAI_VECTOR_STORE_IDS` | none | Comma-separated OpenAI vector store IDs used by the assistant for file search. |
| `CHATKIT_APP_TITLE` | `ChatKit` | Application title shown in exported documents. |
| `VITE_CHATKIT_API_URL` | `/chatkit` | Frontend ChatKit API URL. |
| `VITE_CHATKIT_API_DOMAIN_KEY` | `domain_pk_localhost_dev` | ChatKit domain key. |
| `CHATKIT_STORE_PATH` | `.data/chatkit-store.json` | File-store location relative to `backend/`. |
| `CHATKIT_MAX_ATTACHMENT_BYTES` | `26214400` | Maximum upload size. |
| `CHATKIT_ALLOWED_ORIGINS` | local origins and ChatKit CDN | CORS allowlist. |
| `CHATKIT_PUBLIC_BASE_URL` | none | Public HTTPS URL for previews and downloads. |

Environment variables are loaded from `chatkit/.env.local`. Vite also uses
this file for `VITE_*` variables.

### Vector store

Create an OpenAI vector store, upload and index files in it, then add its ID to
`.env.local`:

```env
OPENAI_VECTOR_STORE_IDS=vs_123
```

Multiple stores can be provided as a comma-separated list. When at least one ID
is configured, the assistant receives the hosted file-search tool and can use
the indexed files to answer questions. Leaving the variable empty disables
vector-store search.

Use the upload button beside the composer to attach a file to the active
conversation only. Use the `Files` button to choose a configured vector store
and upload a file to its knowledge base. The knowledge-base upload waits for
indexing to finish. Uploading another file with the same name to the same store
replaces and reindexes the previous file after the new version succeeds.

The file list in the same panel supports deleting individual files or all files
from the selected store. Deletion removes the vector-store association and then
deletes the underlying OpenAI File from the account. This assumes files managed
by this app are not shared with another vector store or workflow.

## Chat Export

When a conversation is active, use the `Export` menu in the header to choose
`PDF`, `DOCX`, or `MD` and download the complete stored conversation. Exports include
the configured application title, chat title, export date/time, and full thread
history, including messages older than the context window used by the assistant.
Temporary conversations can be exported while they are active, but are lost
when the backend restarts.

## Storage and Privacy

Persistent file storage is always used for normal chats. Full thread content,
including questions and answers, is saved in the configured JSON store and
survives backend restarts. The local `.data` directory is excluded from Git
and is created on first write.

Use the `Temporary` toggle in the header to choose the conversation mode:

- Toggle off uses persistent storage and includes chats in history.
- Toggle on uses an in-memory store, omits chats from history, and discards
	them when the backend restarts.

Switching the toggle starts a new conversation. The persistent and temporary
ChatKit sessions remain separate, so switching back restores persistent
history and its selected thread without adding or removing anything.

The `Delete all` action removes all local threads, messages, attachment
metadata, uploaded files, generated files, and persisted history. Files already
stored remotely by OpenAI are outside this local cleanup operation.

## File Previews and Downloads

The hosted ChatKit UI runs in an HTTPS iframe. Browsers cannot let it fetch
files from `127.0.0.1`, so local image previews use a placeholder by default.
To enable real previews and generated-file downloads, expose the backend over
HTTPS:

```bash
ngrok http 8000
```

Then set the tunnel URL:

```env
CHATKIT_PUBLIC_BASE_URL=https://your-tunnel.ngrok-free.app
```

Restart the app and upload or generate a new file. Existing messages retain
their original URLs.

## Troubleshooting

### Frontend reports `ECONNREFUSED 127.0.0.1:8000`

Wait for the backend startup to finish, or restart with `npm run dev`. The
frontend startup includes a readiness check, but requests from an old browser
tab may still have failed before the backend was ready.

### Image preview is a placeholder

This is expected without `CHATKIT_PUBLIC_BASE_URL`. Use an HTTPS tunnel for
real previews; CORS settings cannot override browser loopback restrictions.

### Persistent history does not appear after switching modes

Make sure the persistent session is selected by turning the `Temporary` toggle
off. Persistent history is stored at `CHATKIT_STORE_PATH` and is independent
of the temporary session.

## Customize

- Update UI and connection settings in `frontend/src/lib/config.ts`.
- Adjust layout in `frontend/src/components/ChatKitPanel.tsx`.
- Swap the in-memory store in `backend/app/server.py` for persistence.

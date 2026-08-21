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

## Configuration

Copy `.env.example` to `.env.local` and update the values as needed:

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | none | Backend authentication with OpenAI. |
| `OPENAI_MODEL` | `gpt-5.6-luna` | Agent model name. |
| `VITE_CHATKIT_API_URL` | `/chatkit` | Frontend ChatKit API URL. |
| `VITE_CHATKIT_API_DOMAIN_KEY` | `domain_pk_localhost_dev` | ChatKit domain key. |
| `CHATKIT_STORE_PATH` | `backend/.data/chatkit-store.json` | File-store location. |
| `CHATKIT_MAX_ATTACHMENT_BYTES` | `26214400` | Maximum upload size. |
| `CHATKIT_ALLOWED_ORIGINS` | local origins and ChatKit CDN | CORS allowlist. |
| `CHATKIT_PUBLIC_BASE_URL` | none | Public HTTPS URL for previews and downloads. |

Environment variables are loaded from `chatkit/.env.local`. Vite also uses
this file for `VITE_*` variables.

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

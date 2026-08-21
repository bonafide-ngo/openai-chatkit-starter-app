# OpenAI ChatKit Starter

A self-hosted ChatKit example with a React frontend and FastAPI backend. The
backend keeps conversation state locally and uses the OpenAI Agents SDK for
responses, web search, code execution, and file analysis.

## Features

- Streaming assistant responses
- Web search and code interpreter tools
- Image and document uploads
- Automatic thread titles
- Light and dark themes
- Persistent local chat history
- Temporary chats without history
- Per-thread and delete-all history controls

## Run It

```bash
cd chatkit
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The command starts both
services. The frontend waits for the backend before starting, so the first
ChatKit request does not race backend startup.

See the [ChatKit guide](chatkit/README.md) for configuration, storage, file
uploads, and deployment notes.

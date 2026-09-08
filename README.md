# SyncCinema

A real-time synchronized video watching application for two remote users. Both parties watch the **same local video file** through the browser — no video streaming involved. Only play/pause/seek commands and chat messages are synced via WebSocket.

## Features

- **Synchronized local video** — both users select the same file locally, only playback state is synced
- **YouTube synchronization** — watch YouTube videos together in sync
- **Two-user rooms** — 5-digit room codes, max 2 participants
- **Host/admin controls** — first user controls playback, second user mirrors
- **Room passwords** — optional password protection
- **Chat** — real-time messaging with typing indicators
- **Reactions** — emoji reactions floating over the video
- **Microphone** — WebRTC voice chat via simple-peer
- **Camera** — WebRTC video chat with local/remote preview
- **STUN/TURN** — Cloudflare TURN integration for NAT traversal
- **External subtitles** — SRT/VTT file support
- **Embedded subtitles** — ffmpeg.wasm extraction from video files
- **Dark/light mode** — theme toggle with persistence
- **Keyboard shortcuts** — Space, F, M, C, Esc, ?
- **Share** — WhatsApp, Twitter, Telegram, clipboard
- **Session persistence** — room/name saved in localStorage
- **Responsive** — mobile-friendly with overlay chat

## Tech Stack

- **Frontend:** React + Vite, Socket.io-client, simple-peer, mp4box, ffmpeg.wasm
- **Backend:** Node.js + Express + Socket.io
- **Sync:** WebSocket (real-time bidirectional)
- **Deploy:** Docker Compose, Nginx reverse proxy

## Getting Started

### 1) Backend

```bash
cd backend
cp .env.example .env   # configure allowed origins
npm install
npm start
```

Server runs on port 3001.

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### 3) Docker

```bash
docker compose up -d --build
```

Frontend: `http://localhost:8050`, Backend: internal port 3001.

## Environment Variables

### Backend

| Variable | Description | Default |
|----------|-------------|---------|
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `http://localhost:5173` |
| `SITE_PASSWORD` | Optional site entry password | _(empty = no auth)_ |
| `CLOUDFLARE_TURN_TOKEN` | Cloudflare TURN API token | _(empty = STUN-only)_ |
| `CLOUDFLARE_TURN_KEY_ID` | Cloudflare TURN key ID | `1` |

### Frontend (build args)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_SOCKET_URL` | Socket.io server URL | `/` |

## How It Works

1. Open `http://localhost:5173` in two different browser tabs (or two different machines).
2. Enter the same **Room Name** (e.g. `movie-night`), use different display names, and click "Join Room".
3. Select the **same video file** on both sides (the file is not uploaded to the server — it plays locally via `URL.createObjectURL`).
4. When one side plays/pauses/seeks, the other side mirrors the action with ~100-200ms delay.
5. Use the chat panel on the right for real-time messaging.

## Architecture

```
Browser A ──┐                      ┌── Browser B
            │   Socket.io (WS)     │
            ├──────────────────────┤
            │                      │
            │   Nginx (port 8050)  │
            │   ├── /             → React SPA
            │   ├── /socket.io/*  → backend:3001
            │   └── /api/*        → backend:3001
            │                      │
            └──────────────────────┘
                       │
                Backend (port 3001)
                ├── Room management
                ├── Playback sync relay
                ├── Chat relay
                ├── TURN credentials
                └── Rate limiting
```

**Important:** Local video files are NOT uploaded. Both participants need compatible copies of the same media for local playback synchronization.

## Infinite Loop Protection

An `isIncomingSignal` ref flag prevents feedback loops:

- When a video action arrives from the server, the flag is set to `true`, the video updates, then resets after 100ms.
- User-triggered `onPlay`/`onPause`/`onSeeked` events skip server emission when the flag is `true`.

## Testing

```bash
# Backend
cd backend && npm test

# Frontend
cd frontend && npm test

# Full Docker test
./test.sh
```

## Production Notes

- Restrict `ALLOWED_ORIGINS` to your domain.
- Set `SITE_PASSWORD` for private access.
- Configure `CLOUDFLARE_TURN_TOKEN` for TURN relay (required when STUN fails behind symmetric NAT).
- Both sides must use the **exact same video file** (same encoding, same duration) for perfect sync.

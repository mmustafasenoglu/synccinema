# SyncCinema 🎬

A real-time synchronized video watching application for two remote users. Both parties watch the **same local video file** through the browser — no video streaming involved. Only play/pause/seek commands and chat messages are synced via WebSocket.

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express + Socket.io
- **Sync:** WebSocket (real-time bidirectional)

## Getting Started

### 1) Backend

```bash
cd backend
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

## How It Works

1. Open `http://localhost:5173` in two different browser tabs (or two different machines).
2. Enter the same **Room Name** (e.g. `movie-night`), use different display names, and click "Join Room".
3. Select the **same video file** on both sides (the file is not uploaded to the server — it plays locally via `URL.createObjectURL`).
4. When one side plays/pauses/seeks, the other side mirrors the action with ~100-200ms delay.
5. Use the chat panel on the right for real-time messaging.

## Remote Access

To connect from different networks, expose the backend via a VPS, ngrok, or Cloudflare Tunnel. Then update the `SOCKET_URL` constant in `frontend/src/App.jsx` to your server address.

CORS is configured with `origin: "*"` for development. Restrict this in production.

## Infinite Loop Protection

An `isIncomingSignal` ref flag prevents feedback loops:

- When a video action arrives from the server, the flag is set to `true`, the video updates, then resets after 100ms.
- User-triggered `onPlay`/`onPause`/`onSeeked` events skip server emission when the flag is `true`.

## Production Notes

- This project is for development/personal use. Restrict CORS `origin` in production.
- Both sides must use the **exact same video file** (same encoding, same duration) for perfect sync.

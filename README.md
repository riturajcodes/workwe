# WorkWe

Random "work buddy" matching with video, audio, screen share and chat (MERN + Socket.IO + WebRTC).

## Setup
1. **Google sign-in**: create an OAuth *Web* client at https://console.cloud.google.com/apis/credentials, add `http://localhost:5173` as an authorized JS origin, then set the same client ID in:
   - `server/.env` → `GOOGLE_CLIENT_ID`
   - `client/.env` → `VITE_GOOGLE_CLIENT_ID`
2. Run both:
   ```
   cd server && npm run dev     # :4000
   cd client && npm run dev     # :5173
   ```
Open http://localhost:5173 in two browser windows to test a match.

## How it works
- `server/src/index.js` – Express + Socket.IO: matchmaking queue, WebRTC signaling relay, chat, Google token verification, JWT.
- `server/src/quota.js` – 5 free matches/day for guests (by guest id, with a looser IP backstop); signed-in users are unlimited.
- `client/src/useWorkRoom.js` – WebRTC "perfect negotiation" so screen share can be added/removed mid-call.

For production, add a TURN server to `ICE` in `useWorkRoom.js` (STUN alone fails behind strict NATs) and serve over HTTPS (required for camera/screen share).

## [DEMO VIDEO CLICK THIS](https://drive.google.com/file/d/1WZnZbiOrvAW4CG_Af4V-2BRLyBIL7ADk/view?usp=sharing)
# WorkWe

**Focus alongside someone, live.** WorkWe pairs you with a random person for a live co-working session: see each other, share screens, chat, and skip to someone new whenever you like.

---

## Problem Statement

Working alone is easy to start and hard to sustain. Remote workers, freelancers and students often lose focus, procrastinate, and feel isolated, and "body doubling" (working in the presence of another person) is a well-known way to stay on task. But the options today are awkward:

- Co-working sessions usually need to be scheduled in advance.
- You have to know someone who is free at the same moment.
- Video-call tools aren't built for it: no matching, no easy way to leave a session that isn't working, and no shared screens by default.

There is no quick way to get a real person beside you *right now*, with no setup and no social pressure.

## Target Users

- **Remote workers and freelancers** who miss the energy of an office.
- **Students** studying for exams or writing assignments.
- **People who focus better with someone present**, including many people with ADHD who use body doubling deliberately.
- **Anyone** who wants accountability for a work block without arranging it with a friend first.

## Solution

WorkWe turns body doubling into a single click. You press **Join**, the server matches you with another person who is also looking, and a peer-to-peer video call starts straight away. Both of you can share a screen at the same time, so you can see each other actually working. If the pairing isn't a good fit, one click on **Next** puts both of you back in the queue, with no awkward goodbye.

Matching is random but fair: you are never paired with yourself, and you won't keep meeting the same people. Video goes directly between the two browsers and nothing is recorded.

## Key Features

- **Random matching** with a live count of how many people are online.
- **Video and audio calls** (WebRTC) with echo cancellation and noise suppression.
- **Two-way screen sharing**: both people can share at once, with the cameras kept in view in the corner.
- **Live chat** alongside the call.
- **Emoji reactions** that burst across both screens with the same animation for both people.
- **Skip with confirmation**: when one person skips, both are re-queued automatically.
- **Fair matching**: no self-matches, a short cooldown after meeting someone, and a preference for people you haven't met in the last two hours.
- **Free tier and login**: guests get 5 sessions a day; signing in with Google removes the limit.
- **Dark and light themes** with a toggle (light by default).
- **Scroll-driven landing page** built with GSAP and smooth scrolling, with a reduced-motion fallback.
- **Responsive**: works on desktop and phone-sized screens.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 8, plain CSS, GSAP (ScrollTrigger) and Lenis for the landing animations |
| Realtime | Socket.IO 4 (signaling, matchmaking, chat, presence) |
| Video / audio / screen | WebRTC (peer-to-peer, "perfect negotiation" pattern) |
| Backend | Node.js, Express 5 |
| Database | MongoDB with Mongoose 9 |
| Auth | Google Identity Services (client) + `google-auth-library` (server), JWT sessions |

## Architecture

```
┌──────────────┐   Socket.IO (signaling, chat, presence)   ┌────────────────────┐
│  Browser A   │ ◄───────────────────────────────────────► │   Node / Express   │
│  React app   │                                           │  + Socket.IO       │ ◄──► MongoDB
└──────┬───────┘                                           │  matchmaking queue │      (users,
       │                                                   └────────────────────┘       usage)
       │   WebRTC: video, audio, screen (peer-to-peer)              ▲
       ▼                                                            │
┌──────────────┐                                                    │
│  Browser B   │ ◄──────────────────────────────────────────────────┘
└──────────────┘
```

**Server** (`server/src`)
- `index.js`: HTTP API (`/api/auth/google`, `/api/me`, `/api/online`), the Socket.IO server, the in-memory matchmaking queue, and the relay for WebRTC signals, chat, status and reactions.
- `quota.js`: the daily free-session limit. Guests are counted by a browser-generated ID plus a looser per-IP backstop; signed-in users are unlimited.
- `models.js`: the two Mongoose models, `User` (Google profile) and `Usage` (daily counters, which expire automatically).

**Client** (`client/src`)
- `useWorkRoom.js`: owns the socket and the `RTCPeerConnection`. It handles matching state, camera/mic, adding and removing screen tracks mid-call, chat, reactions and presence.
- `App.jsx`: top-level state (theme, login, modals) and the call room layout.
- `Landing.jsx`: the animated landing page.
- `components.jsx`: video tiles, chat, controls, reaction layer and shared icons.

**How a session works**
1. Both clients connect over Socket.IO and send `find`.
2. The server checks the daily limit, then picks a random eligible partner from the queue and tells both clients they are matched.
3. The two browsers exchange WebRTC offers, answers and ICE candidates through the server, then stream media directly to each other.
4. If either person skips or leaves, the other is notified and automatically re-queued.

## Local Setup

**Prerequisites:** Node.js 18 or newer, and a MongoDB database (a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster works).

1. **Clone and install**
   ```bash
   git clone https://github.com/riturajcodes/workwe.git
   cd workwe
   cd server && npm install
   cd ../client && npm install
   ```
2. **Create the env files** from the templates and fill them in (see [Environment Variables](#environment-variables)):
   ```bash
   cp server/.env.example server/.env
   cp client/.env.example client/.env
   ```
3. **Start the backend** (port 4000):
   ```bash
   cd server && npm run dev
   ```
4. **Start the frontend** (port 5173), in a second terminal:
   ```bash
   cd client && npm run dev
   ```
5. Open **https://localhost:5173**. The dev server uses a self-signed certificate (browsers only allow camera and screen sharing on HTTPS), so accept the browser warning the first time.

**Testing a match:** use two different browsers or devices. Two tabs in one browser count as the same person and will never be matched with each other.

**Testing on your local network:** the dev server listens on all interfaces, so a friend on the same Wi-Fi can open `https://<your-ip>:5173`. API and WebSocket traffic is proxied through the same origin, so no extra ports are needed.

**Google sign-in (optional):** create an OAuth *Web* client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials), add `https://localhost:5173` (and `http://localhost:5173`) under *Authorized JavaScript origins*, and put the client ID in both env files. Without it the app works fine; only the Log in button is inactive.

## Environment Variables

Documented without values. Copy the `.env.example` files and fill in your own.

**Backend: `server/.env`**

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | Yes | MongoDB connection string, including the database name. |
| `JWT_SECRET` | Yes | Long random string used to sign login tokens. Generate with `openssl rand -hex 32`. |
| `GOOGLE_CLIENT_ID` | For login | Google OAuth Web client ID, used to verify Google sign-ins. |
| `PORT` | No | Server port. Default `4000`. |
| `CLIENT_ORIGIN` | No | Allowed frontend origin(s), comma-separated. Default `http://localhost:5173`. |
| `FREE_MATCHES_PER_DAY` | No | Free sessions per day for guests. Default `5`. |

**Frontend: `client/.env`**

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | For login | The same Google client ID as the backend. |
| `VITE_SERVER_URL` | No | Backend URL. Leave blank in development (the dev server proxies `/api` and `/socket.io`); set it in production, for example `https://api.example.com`. |

> `.env` files are git-ignored. Never commit real credentials.

## Deployment

**Live demo:** _not deployed yet. Add the URL here once it is._

To deploy your own copy:

1. **Backend** on a host that supports long-lived Node processes and WebSockets (Render, Railway, Fly.io, a VPS). Run `npm start` in `server/` and set the backend environment variables. Set `CLIENT_ORIGIN` to your frontend URL.
2. **Frontend** as a static site (Vercel, Netlify, Cloudflare Pages). Build with `npm run build` in `client/` and publish `client/dist`. Set `VITE_SERVER_URL` to the backend URL *before* building.
3. **Google sign-in:** add the deployed frontend URL as an authorized JavaScript origin on your OAuth client.
4. **HTTPS is required** in production: browsers block camera, microphone and screen sharing on insecure origins.
5. **TURN server:** the app uses public STUN servers only, which fail for some users behind strict networks. For reliable calls in production, add a TURN server to the `iceServers` list in `client/src/useWorkRoom.js` (for example Twilio, Metered or a self-hosted coturn).

Note: the matchmaking queue and presence are held in memory, so run a single backend instance (or add a shared store such as Redis before scaling out).

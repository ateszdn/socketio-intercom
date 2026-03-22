# Intercom - Broadcast Control System

A real-time intercom and tally light system for video production, built with Socket.IO and integrated with Blackmagic ATEM Mini and OBS Studio.

## What It Does

- **Camera selection** - Select CAM-1, CAM-2, or CAM-3 from the admin panel and display the selection to camera operators in real time
- **Operator messaging** - Send visual commands to operators: zoom, brightness, focus, tripod direction, and OK acknowledgement
- **Tally lights** - Show which camera is in preview (green) and program/live (red), pulled directly from the ATEM Mini
- **Streaming & recording status** - Display "On Air" and "Disk Recording" indicators from ATEM Mini and/or OBS Studio (OR logic — either source triggers the indicator)
- **Fairlight audio control** - Adjust Mic-1 fader gain on the ATEM Mini's built-in audio mixer
- **Canvas image sharing** - Draw on a canvas with pan/zoom, save as WebP, and broadcast to all clients
- **QR code access** - Auto-generated QR code on the admin panel for quick client access
- **Persistent messages** - Camera and message selections survive server restarts

## Architecture

```
ATEM Mini (Blackmagic)          OBS Studio
    ^                               ^
    | atem-connection               | obs-websocket-js
    | (auto-discovered              | (ws://localhost:4455)
    |  via Bonjour/mDNS)           |
    v                               v
 Node.js Server (Express + Socket.IO)  :3101
    |
    |--- /admin  --> Admin dashboard (full control)
    |--- /       --> Client view (read-only display for operators)
```

Streaming/recording status is combined with OR logic: if **either** ATEM or OBS is streaming/recording, the "On Air" / "Disk" indicators light up. Tally lights (preview/program) come exclusively from the ATEM.

## Project Structure

```
.
├── server.js                   # Express server, Socket.IO events, status broadcasting
├── package.json
├── tailwind.config.js
├── eslint.config.js            # ESLint configuration
├── .env.example                # Environment variable template
├── utils/
│   ├── atem.js                 # ATEM Mini connection & Bonjour discovery
│   ├── obs.js                  # OBS WebSocket connection & state tracking
│   ├── localNetwork.js         # Detects local IPv4 addresses
│   └── utils.js                # Date formatting utility
├── views/
│   ├── admin.pug               # Admin dashboard (control interface)
│   └── index.pug               # Client view (operator display)
├── static/
│   ├── script.js               # Client-side Socket.IO logic & canvas viewer
│   ├── style.css               # Source CSS (Tailwind input)
│   ├── output.css              # Compiled Tailwind CSS (generated)
│   ├── images/                 # SVG icons for cameras, messages, logo
│   │   └── screenshot/         # Saved canvas images (WebP)
│   └── qr/
│       └── qrcode.svg          # Auto-generated QR code
├── json/
│   ├── btnData.json            # Button definitions & SVG paths
│   └── messages.json           # Persistent message storage
└── logs/
    └── myAtem.json             # ATEM device state logs
```

## Prerequisites

- **Node.js** (v16 or later)
- **Blackmagic ATEM Mini** on the same local network (discovered automatically via Bonjour) — optional
- **OBS Studio** (v28+) with WebSocket Server enabled — optional

At least one of ATEM or OBS is needed for streaming/recording indicators to work.

## Getting Started

### Install dependencies

```bash
npm install
```

### Configure environment (optional)

```bash
cp .env.example .env
```

Edit `.env` to set port, OBS WebSocket password, or ATEM audio config. All values have sensible defaults.

### Start the server

```bash
npm start
```

Or with auto-restart and Tailwind watcher (development):

```bash
npm run dev
```

The server starts on port **3101** by default. Override with `PORT` in `.env` or:

```bash
PORT=4000 npm start
```

### Compile Tailwind CSS only

```bash
npm run tw
```

### Lint

```bash
npm run lint
```

### Access the interfaces

| Route    | Purpose                                             |
| -------- | --------------------------------------------------- |
| `/admin` | Admin dashboard - camera/message controls            |
| `/`      | Client view - read-only display for camera operators |

On startup, the terminal prints a clickable URL to `/admin`. The QR code (`static/qr/qrcode.svg`) points to `/` so operators can scan it to open the client view on their phones.

## Socket.IO Events

### Client to Server

| Event           | Payload      | Description                        |
| --------------- | ------------ | ---------------------------------- |
| `clientCam`     | `"cam-1"` etc. | Select a camera                 |
| `clientMessage` | `"zoom-in"` etc. | Send a message/command         |
| `clientReset`   | _(none)_     | Clear all displays                 |

### Server to Client

| Event                        | Payload                                          | Description                              |
| ---------------------------- | ------------------------------------------------ | ---------------------------------------- |
| `camBack`                    | `"cam-1"` or `"reset"`                           | Camera selection update                  |
| `messageBack`                | `"zoom-in"` or `"reset"`                         | Message/command update                   |
| `storedMessages`             | `[{cam: "cam-1"}, {msg: "zoom-in"}]`             | Full message state on connect            |
| `getStreamingAndInputStatus` | `{strmStatus, dskStatus, inputs?}`               | Combined ATEM+OBS status on connect      |
| `streamingStatusChanged`     | `{strmStatus, dskStatus}`                        | Streaming/recording status change        |
| `InputChanged`               | `{inputs: {previewInput, programInput}}`          | Tally light change (preview/program)     |
| `imageSaved`                 | `{imagePath: "/static/images/screenshot/..."}` | Canvas image broadcast                   |

## Available Commands

### Camera Buttons
`cam-1`, `cam-2`, `cam-3`

### Message Buttons
`ok`, `zoom-in`, `zoom-out`, `brightness-up`, `brightness-down`, `focus-ok`, `focus-off`, `tripod-left`, `tripod-right`, `tripod-up`, `tripod-down`

## ATEM Mini Integration

The server automatically discovers the ATEM Mini on the local network using Bonjour/mDNS (service type `blackmagic`, class `AtemSwitcher`). No manual IP configuration is needed.

### Monitored State

- **Streaming status** - states: `1` (idle), `2` (starting), `4` (streaming), `32` (stopping)
- **Recording status** - `0` (idle) or active
- **Video mix effects** - preview and program input numbers (1-4)
- **Fairlight audio** - Mic-1 input (`1301`) fader gain

### References

- [atem-connection library](https://github.com/nrkno/sofie-atem-connection)
- [Streaming status codes](https://nrkno.github.io/sofie-atem-connection/enums/Enums.StreamingStatus.html)
- [Recording status codes](https://nrkno.github.io/sofie-atem-connection/enums/Enums.RecordingStatus.html)

## OBS Studio Integration

The server connects to OBS via the built-in WebSocket server (available in OBS v28+).

### Setup

1. In OBS, go to **Tools > WebSocket Server Settings**
2. Enable the WebSocket server (default port: `4455`)
3. If you set a password, add it to `.env`:
   ```
   OBS_PASSWORD=your_password_here
   ```

### Behaviour

- The server auto-connects to OBS on startup and retries every 10 seconds if OBS is not running
- If OBS disconnects mid-session, the server reconnects automatically
- Streaming and recording states are combined with the ATEM using OR logic:
  - `strmStatus = ATEM streaming OR OBS streaming`
  - `dskStatus = ATEM recording OR OBS recording`
- No client-side changes are needed — the same "On Air" and "Disk" indicators work for both sources

### Configuration

| Variable       | Default                  | Description                  |
| -------------- | ------------------------ | ---------------------------- |
| `OBS_URL`      | `ws://localhost:4455`    | OBS WebSocket server address |
| `OBS_PASSWORD` | _(empty)_                | OBS WebSocket password       |

## Tech Stack

- **Backend:** Node.js, Express, Socket.IO, Pug, dotenv
- **Frontend:** Vanilla JavaScript, Tailwind CSS, HTML5 Canvas
- **Hardware:** atem-connection, Bonjour (mDNS discovery)
- **Streaming:** obs-websocket-js (OBS Studio integration)
- **Utilities:** qrcode (SVG generation), body-parser, cors
- **Dev tools:** ESLint, concurrently, nodemon, Tailwind CLI

# Intercom - Broadcast Control System

A real-time intercom and tally light system for video production, built with Socket.IO and integrated with Blackmagic ATEM Mini and OBS Studio.

## What It Does

- **Camera selection** - Select CAM-1, CAM-2, or CAM-3 from the admin panel and display the selection to camera operators in real time
- **Operator messaging** - Send visual commands to operators: zoom, brightness, focus, tripod direction, and OK acknowledgement
- **Tally lights** - Show which camera is in preview (green) and program/live (red), pulled directly from the ATEM Mini
- **Streaming & recording status** - Display "On Air" and "Disk Recording" indicators from ATEM Mini and/or OBS Studio (OR logic — either source triggers the indicator)
<!-- Disabled: the Mic-1 fader code was removed (see CHANGES.md e5b8271)
- **Fairlight audio control** - Adjust Mic-1 fader gain on the ATEM Mini's built-in audio mixer
-->
- **Motorized master fader** - A physical motorized fader (Arduino Uno over USB) controls the ATEM's Fairlight master level, and follows it when the level changes elsewhere
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
    |
    |--- USB serial --> Arduino Uno + motorized fader (master gain)
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
│   ├── fader.js                # Motorized fader (serial) <-> ATEM master gain
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

Edit `.env` to set port, OBS WebSocket password, or the fader's serial port. All values have sensible defaults.

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
| `obsPreview`                 | `"data:image/jpeg;base64,..."`                   | OBS program preview (when MSG box idle)  |

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
- **Fairlight master** - master fader gain, kept in sync with the motorized fader
<!-- Disabled: the Mic-1 fader code was removed
- **Fairlight audio** - Mic-1 input (`1301`) fader gain
-->

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

### Program Preview

When the MSG box is idle (no active message), the server periodically captures a low-res screenshot of the OBS program output and pushes it to all clients. This gives camera operators a reference of the current live composition so they can adjust their framing.

- The preview automatically pauses when a message is sent and resumes on reset
- Sent as base64 JPEG over Socket.IO — no files written to disk

### Configuration

| Variable               | Default                  | Description                          |
| ---------------------- | ------------------------ | ------------------------------------ |
| `OBS_URL`              | `ws://localhost:4455`    | OBS WebSocket server address         |
| `OBS_PASSWORD`         | _(empty)_                | OBS WebSocket password               |
| `OBS_PREVIEW_INTERVAL` | `3000`                   | Preview capture interval (ms)        |
| `OBS_PREVIEW_WIDTH`    | `320`                    | Preview image width (px)             |
| `OBS_PREVIEW_QUALITY`  | `30`                     | JPEG compression quality (1-100)     |

## Motorized Fader

A motorized fader (ALPS RSA0N11M9A0J) on an Arduino Uno drives the ATEM's Fairlight master gain in both directions. The hardware (KiCad schematic) and the `fader.ino` firmware live in the separate `atem-motorfader` project.

### Setup

1. Flash `fader.ino` to the Uno and plug it in over USB
2. Start the server. It finds the Uno automatically, or set `FADER_PORT` in `.env`

### Behaviour

- Moving the fader by hand sets the ATEM master gain (throttled to one update every 25 ms)
- When the master gain changes elsewhere (ATEM Software Control, Stream Deck), the motor moves the fader to match
- While a hand is on the knob (touch sense), the motor stays off. On release, the fader wins if it was moved; otherwise it catches up with the ATEM
- On startup, and whenever the board reconnects, the fader moves to the current master gain
- If the board is unplugged, the server retries every 5 seconds

The position-to-dB curve is console-style: the bottom 3% of travel is -100 dB (-∞) to -60 dB, 0 dB sits at 75% travel, and -30 dB to the maximum takes 70% of the travel. Adjust it in the `TAPER` table in [utils/fader.js](utils/fader.js).

### Configuration

| Variable       | Default        | Description                                           |
| -------------- | -------------- | ----------------------------------------------------- |
| `FADER_PORT`   | _(auto)_       | Serial port of the Uno, e.g. `/dev/cu.usbmodem14101`  |
| `FADER_BAUD`   | `115200`       | Serial baud rate (must match the firmware)            |
| `FADER_MAX_DB` | `6`            | Master gain at the top of the fader travel (dB)       |

## Tech Stack

- **Backend:** Node.js, Express, Socket.IO, Pug, dotenv
- **Frontend:** Vanilla JavaScript, Tailwind CSS, HTML5 Canvas
- **Hardware:** atem-connection, Bonjour (mDNS discovery), serialport (motorized fader)
- **Streaming:** obs-websocket-js (OBS Studio integration)
- **Utilities:** qrcode (SVG generation), body-parser, cors
- **Dev tools:** ESLint, concurrently, nodemon, Tailwind CLI

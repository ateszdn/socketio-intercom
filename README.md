# Intercom - Broadcast Control System

A real-time intercom and tally light system for video production, built with Socket.IO and integrated with a Blackmagic ATEM Mini switcher.

## What It Does

- **Camera selection** - Select CAM-1, CAM-2, or CAM-3 from the admin panel and display the selection to camera operators in real time
- **Operator messaging** - Send visual commands to operators: zoom, brightness, focus, tripod direction, and OK acknowledgement
- **Tally lights** - Show which camera is in preview (green) and program/live (red), pulled directly from the ATEM Mini
- **Streaming & recording status** - Display "On Air" and "Disk Recording" indicators from the ATEM Mini
- **Fairlight audio control** - Adjust Mic-1 fader gain on the ATEM Mini's built-in audio mixer
- **Canvas image sharing** - Draw on a canvas with pan/zoom, save as WebP, and broadcast to all clients
- **QR code access** - Auto-generated QR code on the admin panel for quick client access
- **Persistent messages** - Camera and message selections survive server restarts

## Architecture

```
ATEM Mini (Blackmagic)
    ^
    | atem-connection (auto-discovered via Bonjour/mDNS)
    v
Node.js Server (Express + Socket.IO)  :3101
    |
    |--- /admin  --> Admin dashboard (full control)
    |--- /       --> Client view (read-only display for operators)
```

All communication between admin, server, and client views happens over Socket.IO in real time.

## Project Structure

```
.
├── server.js                   # Express server, Socket.IO events, ATEM state handling
├── package.json
├── tailwind.config.js
├── utils/
│   ├── atem.js                 # ATEM Mini connection & Bonjour discovery
│   ├── localNetwork.js         # Detects local IPv4 addresses
│   └── utils.js                # Date formatting utility
├── views/
│   ├── admin.pug               # Admin dashboard (control interface)
│   └── index.pug               # Client view (operator display)
├── static/
│   ├── script.js               # Client-side Socket.IO logic & canvas viewer
│   ├── style.css               # Source CSS (Tailwind input)
│   ├── output.css              # Compiled Tailwind CSS
│   ├── images/                 # SVG icons for cameras, messages, logo
│   │   └── screenshot/         # Saved canvas images (WebP)
│   └── qr/
│       └── qrcode.svg          # Auto-generated QR code
├── json/
│   ├── btnData.json            # Button definitions & SVG paths
│   └── messages.json           # Persistent message storage
├── public/
│   ├── index_template.html     # Template with __CLIENT_ADDRESS__ placeholder
│   └── index.html              # Generated at startup (not committed)
└── logs/
    └── myAtem.json             # ATEM device state logs
```

## Prerequisites

- **Node.js** (v16 or later)
- **Blackmagic ATEM Mini** on the same local network (discovered automatically via Bonjour)

## Getting Started

### Install dependencies

```bash
npm install
```

### Start the server

```bash
npm start
```

Or with auto-restart on file changes (development):

```bash
npm run dev
```

The server starts on port **3101** by default. Override with the `PORT` environment variable:

```bash
PORT=4000 npm start
```

### Compile Tailwind CSS (development)

```bash
npm run tw
```

This watches `static/style.css` and outputs to `static/output.css`.

### Access the interfaces

| Route    | Purpose                                    |
| -------- | ------------------------------------------ |
| `/admin` | Admin dashboard - camera/message controls  |
| `/`      | Client view - read-only display for operators |

On startup, the server logs the local network URL and generates a QR code at `static/qr/qrcode.svg` pointing to the client address.

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
| `getStreamingAndInputStatus` | `{strmStatus, dskStatus, inputs}`                | ATEM status on connect                   |
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

## Tech Stack

- **Backend:** Node.js, Express, Socket.IO, Pug
- **Frontend:** Vanilla JavaScript, Tailwind CSS, HTML5 Canvas
- **Hardware:** atem-connection, Bonjour (mDNS discovery)
- **Utilities:** qrcode (SVG generation), body-parser, cors

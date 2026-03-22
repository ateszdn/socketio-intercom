# Improvements, Fixes & Refactoring Plan

A prioritised audit of the codebase — bugs first, then security, architecture, and polish.

---

## 1. Bugs & Broken Behaviour

### 1.1 Crash when ATEM Mini is not on the network
**File:** [server.js:213](server.js#L213)
`AtemDevice.connected` is checked on line 213, but line 195 only checks `if (AtemDevice)` — which is always truthy (it's the exported `myAtem` instance). If the device is not connected, accessing deep state properties like `AtemDevice.state.fairlight.inputs['1301'].sources` on line 201 will throw and crash the server.

**Fix:** Guard the entire block with `if (AtemDevice.connected)`, or move lines 196-212 inside an `AtemDevice.on('connected', ...)` callback.

### 1.2 `stateChanged` listener runs even when disconnected
**File:** [server.js:285](server.js#L285)
The `AtemDevice.on('stateChanged', ...)` listener is registered at module level. If the device disconnects mid-session, accessing `state.streaming.status` or `state.video.mixEffects` may throw.

**Fix:** Add a `if (!AtemDevice.connected) return;` guard at the top of the callback.

### 1.3 `input-4` element exists but input 4 is hidden and unused
**Files:** [views/admin.pug:35](views/admin.pug#L35), [views/index.pug:26](views/index.pug#L26)
`#input-4` is rendered with `display:none` and labelled "CAM-3" (duplicate). If the ATEM sends `programInput: 4`, `setTallyLights` in [script.js:163](static/script.js#L163) will try to colour it but it's invisible. If it sends a value > 4, the `getElementById` call will return `null` and crash.

**Fix:** Either support input 4 properly or add a bounds check in `setTallyLights`.

### 1.4 Hardcoded Fairlight audio source ID
**File:** [server.js:205-209](server.js#L205-L209)
The source index `-65280` is hardcoded. This is specific to one ATEM model/firmware. On a different ATEM or after a firmware update this will throw.

**Fix:** Enumerate `AtemDevice.state.fairlight.inputs['1301'].sources` dynamically, or at minimum wrap in a try/catch.

### 1.5 `admin.js` is dead code
**File:** [static/admin.js](static/admin.js)
Hardcoded to `http://localhost:3000` (wrong port), contains Hungarian comment "NEM KELL" (= "NOT NEEDED"), and is not referenced by any view.

**Fix:** Delete this file.

---

## 2. Security & Robustness

### 2.1 No authentication on `/admin`
Anyone on the network can access the admin panel and control cameras, send messages, or save images. In a production/event environment this is risky.

**Fix:** Add at minimum basic HTTP auth or a simple token query-parameter for the `/admin` route.

### 2.2 CORS is wide open
**File:** [server.js:51](server.js#L51), [server.js:60](server.js#L60)
Both Express and Socket.IO allow `origin: "*"`.

**Fix:** Restrict to the server's own address or known client origins.

### 2.3 No input validation on `/save-image`
**File:** [server.js:130-164](server.js#L130-L164)
- No size limit beyond the 50MB body-parser cap — a single request can fill disk.
- The `dataUrl` prefix check only handles `image/webp` — any other MIME prefix is silently stored as garbage.
- The "delete all files" step is a full directory wipe before every new image, with no error handling on the async unlinks finishing before the new write.

**Fix:**
- Validate the base64 payload and MIME type.
- Use `fs.promises` (or `rimraf`) and `await` the cleanup before writing.
- Add a reasonable file-size check.

### 2.4 `public/index.html` is generated at startup with no escaping
**File:** [server.js:25-40](server.js#L25-L40)
The `__CLIENT_ADDRESS__` replacement injects the server IP into an HTML file. Currently safe because it's a local IP, but this pattern is fragile.

**Fix:** Use the Pug template engine for this file too, or serve it via a route instead of a static file.

### 2.5 `.gitignore` is incomplete
Missing entries: `public/index.html` (generated), `static/output.css` (generated), `static/qr/qrcode.svg` (generated), `static/images/screenshot/` (user content), `log.txt` is listed but logs may still leak.

---

## 3. Architecture & Refactoring

### 3.1 Split `server.js` into modules
At 305 lines, `server.js` handles Express setup, Socket.IO events, ATEM state management, QR generation, file I/O, and image saving. Each concern should be its own module:

```
src/
├── app.js              # Express app setup & middleware
├── routes/
│   ├── pages.js        # GET / and /admin
│   └── api.js          # POST /save-image
├── sockets/
│   └── handlers.js     # Socket.IO event handlers
├── atem/
│   ├── connection.js   # Discovery + connection (current utils/atem.js)
│   └── events.js       # stateChanged handler, status broadcasting
├── services/
│   └── messages.js     # loadMessages / saveMessages
└── index.js            # Entrypoint: wire everything together
```

### 3.2 Replace sync file I/O with async
**Files:** [server.js:80](server.js#L80), [server.js:97](server.js#L97), [server.js:56](server.js#L56)
`readFileSync`, `writeFileSync`, and `appendFileSync` block the event loop on every socket event. For a real-time app this is a problem under load.

**Fix:** Use `fs.promises.readFile` / `fs.promises.writeFile` (or better, keep messages in memory and flush periodically).

### 3.3 Message persistence is fragile
Every `clientCam` / `clientMessage` event triggers a full file read + full file write. Race conditions are possible if two events arrive simultaneously.

**Fix:** Keep `messages` in memory as the source of truth and debounce writes (e.g., write at most once per second), or use a lightweight database like SQLite/better-sqlite3.

### 3.4 Remove the `public/index_template.html` → `index.html` pattern
This file exists only to redirect to `/admin` with the correct IP baked in. It can be replaced with a simple Express redirect route:

```js
app.get('/go', (req, res) => res.redirect('/admin'));
```

Or serve it as a Pug template. The file generation at startup is unnecessary complexity.

### 3.5 Use environment variables / config file for hardware settings
ATEM Fairlight input IDs (`1301`, `-65280`), fader gain values (`-220`, `-320`), and the port are scattered as magic numbers. Centralise them in a config file or `.env`.

### 3.6 Consolidate client-side scripts
[script.js](static/script.js) is 418 lines handling three unrelated concerns: Socket.IO messaging, ATEM tally/streaming UI, and a full canvas pan/zoom viewer. Split into:
- `socket-handlers.js` — Socket.IO connection and event handlers
- `tally.js` — streaming/tally light DOM updates
- `canvas-viewer.js` — pan/zoom/save logic

### 3.7 `views/admin-v2.pug` — leftover or WIP?
**File:** [views/admin-v2.pug](views/admin-v2.pug)
If it's unused, remove it. If it's the next version, rename it and switch.

---

## 4. Code Quality & Cleanup

### 4.1 Remove commented-out code
Large blocks of dead code throughout the codebase:
- [server.js:67-77](server.js#L67-L77) — old async `loadMessages`
- [server.js:88-94](server.js#L88-L94) — old async `saveMessages`
- [server.js:126-128](server.js#L126-L128) — `/api/messages` route
- [script.js:46-61](static/script.js#L46-L61) — old hardcoded button data
- [script.js:75-83](static/script.js#L75-L83) — old `messageBack` handler
- [script.js:105-125](static/script.js#L105-L125) — old event listeners + fetch
- [script.js:206-221](static/script.js#L206-L221) — old `/api/messages` fetch
- Multiple blocks in [utils/atem.js](utils/atem.js) — old async search function

This is what git history is for. Remove all commented-out code.

### 4.2 Remove unused functions and variables
- `drawRect` and `drawText` in [script.js:312-321](static/script.js#L312-L321) — never called.
- `const data = ""` in [server.js:65](server.js#L65) — never used.
- `const printDate = require(...)` in [server.js:184](server.js#L184) — duplicate import (already imported as `printMyDate` on line 9).
- `const { info } = require("console")` in [server.js:185](server.js#L185) — never used.

### 4.3 Inconsistent coding style
- Mix of `let`, `const`, and `var` where `const` would suffice.
- Mix of `==` and `===` (e.g., [script.js:139](static/script.js#L139) uses `==` for booleans).
- Mix of semicolons and no-semicolons.
- Mix of arrow functions and `function` declarations.

**Fix:** Add ESLint with a config (e.g., `eslint:recommended`) and auto-fix.

### 4.4 Remove excessive `console.log` statements
Debug logging is scattered everywhere — `*-/-*-/-*` decorators, `+++++` banners, raw state dumps. These will flood the terminal in production.

**Fix:** Use a proper logger (e.g., `pino` or `winston`) with log levels, or at minimum wrap debug output in a `DEBUG` environment check.

---

## 5. Developer Experience

### 5.1 Add a `.env` file (with `.env.example`)
Centralise `PORT`, ATEM config, and feature flags. Add `.env` to `.gitignore`.

### 5.2 Add a `npm run dev` that runs both server and Tailwind
Currently you need two terminals (`npm run dev` + `npm run tw`). Use `concurrently`:
```json
"dev": "concurrently \"nodemon server.js\" \"npx tailwindcss -i ./static/style.css -o ./static/output.css --watch\""
```

### 5.3 Add generated files to `.gitignore`
```
public/index.html
static/output.css
static/qr/qrcode.svg
static/images/screenshot/
```

### 5.4 Consider upgrading to Tailwind v4
Currently on v3.4.1. Tailwind v4 is available and removes the need for `tailwind.config.js` entirely.

---

## 6. Future Direction

### 6.1 Multi-camera intercom rooms
Support multiple independent intercom sessions (e.g., per-stage or per-studio) using Socket.IO rooms.

### 6.2 Two-way operator communication
Let camera operators send acknowledgements or requests back to the director (beyond just displaying messages).

### 6.3 ATEM input switching from admin panel
The ATEM connection is read-only for video. Add buttons to switch preview/program inputs directly from the admin panel.

### 6.4 Mobile PWA
Add a `manifest.json` and service worker so operators can "install" the client view on their phones for full-screen use.

### 6.5 Reconnection handling
Neither the client Socket.IO nor the ATEM connection have explicit reconnection logic. Socket.IO has built-in reconnection, but the UI doesn't reflect disconnection state. The ATEM Bonjour discovery runs once at startup — if the device appears later, it won't be found.

**Fix:** Re-run Bonjour discovery periodically, and show a connection-status indicator in the UI.

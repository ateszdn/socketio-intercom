# Changelog

## Unreleased

### Added
- **OBS Studio integration** — streaming and recording status from OBS via WebSocket (`obs-websocket-js`), combined with ATEM using OR logic; either source triggers "On Air" / "Disk" indicators
- **`utils/obs.js`** — OBS WebSocket connection with auto-reconnect (retries every 10s)
- **`dotenv` support** — `.env` file for configuration (`PORT`, `OBS_URL`, `OBS_PASSWORD`, Fairlight audio settings)
- **`.env.example`** — documents all available environment variables
- **ESLint** — `eslint.config.js` with project-wide linting rules, `npm run lint`
- **`concurrently`** — `npm run dev` now runs both the server and Tailwind watcher in one command
- **`README.md`** — full project documentation
- **`IMPROVEMENTS.md`** — audit of remaining refactoring opportunities

### Fixed
- **ATEM crash when device not connected** — server no longer crashes if the ATEM Mini is offline; all state access is guarded by `AtemDevice.connected`
- **`stateChanged` crash on disconnect** — early return if ATEM disconnects mid-session
- **Tally light crash on unexpected input IDs** — `setTallyLights` now uses null-safe `getElementById` checks
- **`/save-image` race condition** — now uses `async/await`; old screenshots are fully deleted before writing the new one
- **`/save-image` validation** — rejects requests without a valid `data:image/webp;base64,` prefix
- **Implicit global in `utils.js`** — `myDate` variable was leaking to global scope

### Changed
- **`/` route** — renders the client view (operator display) instead of generating `index.html` from a template; no longer redirects to `/admin`
- **Startup log** — now prints the full clickable `/admin` URL in the terminal
- **QR code** — points to `/` (client view), so operators scan to get the read-only display
- **`package.json`**
  - `main` corrected from `client.js` to `server.js`
  - Combined `dev` script using `concurrently`
  - Added `lint` script
- **`.gitignore`** — now excludes generated files (`static/output.css`, `static/qr/qrcode.svg`, `static/images/screenshot/`, `public/index.html`, `.env`)
- **`node_modules`** — removed from git tracking (was previously committed)
- **Code style** — all `==` changed to `===`, `let` to `const` where appropriate, consistent semicolons
- **`/save-image` body limit** — reduced from 50MB to 10MB

### Removed
- **`static/admin.js`** — dead code, hardcoded to wrong port, never referenced
- **`views/admin-v2.pug`** — superseded by current `admin.pug`
- **`utils/localNetwork-examples.js`** — scratch/example file, unused
- **`public/index_template.html`** — replaced by Express redirect
- **`public/index.html`** — no longer generated at startup
- **~100 lines of commented-out code** across `server.js`, `script.js`, `utils/atem.js`
- **Unused variables** — `data`, `printDate` (duplicate import), `{ info }` from console, `drawRect`, `drawText`
- **Debug logging** — `*-/-*` banners, `+++++` decorators, raw state dumps

---

## v1-pre-refactor (tag)

Everything below this line is the state of the project before the refactoring. The `v1-pre-refactor` tag marks this exact point in git history.

To view any file as it was: `git show v1-pre-refactor:<path>`

### e5b8271 — Add Fairlight audio mixer control and update port/IP config
- Fairlight audio fader gain control for Mic-1 (`setFairlightAudioMixerSourceProps`)
- Port changed to 3101

### 4bdf3aa — Check ATEM connection before emitting status
- Guard `AtemDevice.connected` before sending device status to new clients

### e4c10fb — Fix SD-card icon CSS bug
- Fixed SD-card recording indicator styling

### 67a4207 — Optimisation plus new stuff
- Tripod direction buttons (left, right, up, down)
- Button config moved to `btnData.json`
- UI refinements

### 74b2b1e — New clients get the latest status
- Stored messages sent to newly connected clients
- Persistent message storage in `messages.json`

### 8a2122c — Tally and On Air automation
- Automatic tally light display from ATEM `previewInput` / `programInput`
- On Air indicator from ATEM streaming status
- Disk recording indicator

### f8402cc — Canvas opens in modal dialog
- Image viewer wrapped in `<dialog>` element

### 7720100 — Pan and zoom
- Canvas-based image viewer with mouse/touch pan and pinch-to-zoom

### 7421f78 — Auto detect IP, QR code
- Local network IP auto-detection
- QR code generation for client access
- `index_template.html` with `__CLIENT_ADDRESS__` injection

### 6edfaf7 — ATEM tally lite iframe
- Simple iframe integration of external ATEM tally display

### 16184b5–df81514 — Message UI icons
- SVG-based message icons for camera commands
- Admin layout restructuring

### cff96bd–8de9aa4 — Initial versions
- Basic Socket.IO server with Express and Pug
- Camera selection (CAM-1, CAM-2, CAM-3)
- Admin and client views
- First `.gitignore`

const { SerialPort, ReadlineParser } = require("serialport");

// Motorized fader (Arduino Uno running fader.ino) <-> ATEM Fairlight master
// gain. Protocol, 115200 baud, newline-terminated ASCII:
//   board -> host   R (ready)   P<0-1023> (position)   K1 / K0 (touch)
//   host -> board   T<0-1023> (move to target)   S (stop)
// Hardware and firmware live in the atem-motorfader project.

const FADER_PORT = process.env.FADER_PORT || ""; // empty = auto-detect
const FADER_BAUD = parseInt(process.env.FADER_BAUD, 10) || 115200;
const FADER_MAX_DB = parseFloat(process.env.FADER_MAX_DB) || 6;

// Fairlight gains are integers in hundredths of a dB (atem-connection
// passes faderGain to the wire as a raw int32). -10000 (-100 dB) is the
// bottom of the range and reads as -infinity.
const GAIN_MIN = -10000;

// Console-style taper: [position 0..1, dB]. The bottom 3% of travel fades
// from -100 dB to -60 dB; the useful -30..max range gets 70% of travel.
const TAPER = [
  [0, -100],
  [0.03, -60],
  [0.15, -40],
  [0.3, -30],
  [0.5, -15],
  [0.75, 0],
  [1, FADER_MAX_DB],
];

const POS_MAX = 1023;
const SEND_INTERVAL_MS = 25; // throttle for both directions
const ECHO_TOLERANCE_GAIN = 10; // 0.1 dB: ATEM echoing our own value back
const SETTLE_TOLERANCE_POS = 8; // counts: fader stopped close enough to target
const MOVE_TIMEOUT_MS = 1500; // firmware gives up after 1 s
const RECONNECT_MS = 5000;

// USB vendor IDs: Arduino (2341, 2a03), CH340 clones (1a86), FTDI (0403)
const ARDUINO_VENDOR_IDS = ["2341", "2a03", "1a86", "0403"];

const faderStatus = {
  connected: false, // serial port open
  ready: false, // board has booted and sent R
  touched: false,
  position: null,
};

let movedWhileTouched = false;

let atem = null;
let port = null;
let reconnectTimer = null;

let lastSentGain = null; // last gain we sent to the ATEM
let lastAtemGain = null; // last gain the ATEM reported
let lastTargetPos = null; // last T<n> we sent to the fader
let moveStartedAt = 0;

// --- Mapping ---

function interpolate(x, xs, ys) {
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + t * (ys[i] - ys[i - 1]);
    }
  }
  return ys[ys.length - 1];
}

const taperPos = TAPER.map(([pos]) => pos);
const taperDb = TAPER.map(([, db]) => db);

function positionToGain(position) {
  const pos = Math.min(Math.max(position / POS_MAX, 0), 1);
  const db = interpolate(pos, taperPos, taperDb);
  // Round to 0.1 dB so a resting fader doesn't spam tiny changes
  return Math.max(Math.round(db * 10) * 10, GAIN_MIN);
}

function gainToPosition(gain) {
  const db = Math.min(Math.max(gain / 100, taperDb[0]), FADER_MAX_DB);
  return Math.round(interpolate(db, taperDb, taperPos) * POS_MAX);
}

// --- Throttle: at most one call per interval, always delivering the latest ---

function throttle(fn, intervalMs) {
  let lastRun = 0;
  let timer = null;
  let pending;

  function run() {
    timer = null;
    lastRun = Date.now();
    fn(pending);
  }

  const throttled = (value) => {
    pending = value;
    if (timer) return;
    const wait = intervalMs - (Date.now() - lastRun);
    if (wait <= 0) run();
    else timer = setTimeout(run, wait);
  };

  throttled.flush = () => {
    if (!timer) return;
    clearTimeout(timer);
    run();
  };

  return throttled;
}

// --- Fader -> ATEM ---

const sendGainToAtem = throttle((gain) => {
  if (!atem || !isAtemReady()) return;
  lastSentGain = gain;
  atem.setFairlightAudioMixerMasterProps({ faderGain: gain }).catch((err) => {
    console.error("Fader: failed to set ATEM master gain:", err.message);
  });
}, SEND_INTERVAL_MS);

function moveInProgress() {
  return lastTargetPos !== null && Date.now() - moveStartedAt < MOVE_TIMEOUT_MS;
}

function onPosition(position) {
  faderStatus.position = position;

  if (!faderStatus.touched) {
    // Positions reported while the motor follows the ATEM are not user input
    if (moveInProgress()) {
      if (Math.abs(position - lastTargetPos) <= SETTLE_TOLERANCE_POS) {
        lastTargetPos = position;
        moveStartedAt = 0;
      }
      return;
    }
    // Resting within the dead band of the last target: nothing changed
    if (
      lastTargetPos !== null &&
      Math.abs(position - lastTargetPos) <= SETTLE_TOLERANCE_POS
    ) {
      return;
    }
  }

  lastTargetPos = null;
  if (faderStatus.touched) movedWhileTouched = true;
  sendGainToAtem(positionToGain(position));
}

// --- ATEM -> fader ---

const sendTargetToFader = throttle((position) => {
  if (!faderStatus.ready) return;
  lastTargetPos = position;
  moveStartedAt = Date.now();
  writeLine(`T${position}`);
}, SEND_INTERVAL_MS);

function isAtemReady() {
  return Boolean(atem && atem.state && atem.state.fairlight && atem.state.fairlight.master);
}

function syncFaderToAtem() {
  if (!isAtemReady() || !faderStatus.ready || faderStatus.touched) return;
  const gain = atem.state.fairlight.master.properties.faderGain;
  lastAtemGain = gain;
  sendTargetToFader(gainToPosition(gain));
}

function onAtemStateChanged(state, pathToChange) {
  if (!pathToChange.some((p) => p.startsWith("fairlight.master"))) return;
  if (!isAtemReady()) return;

  const gain = state.fairlight.master.properties.faderGain;
  if (gain === lastAtemGain) return; // e.g. a dynamics/EQ change on the same command
  lastAtemGain = gain;

  // Our own value coming back
  if (lastSentGain !== null && Math.abs(gain - lastSentGain) <= ECHO_TOLERANCE_GAIN) {
    return;
  }
  lastSentGain = null;

  if (faderStatus.touched) return; // the hand wins
  sendTargetToFader(gainToPosition(gain));
}

// --- Serial line handling ---

function writeLine(line) {
  if (!port || !port.isOpen) return;
  port.write(`${line}\n`, (err) => {
    if (err) console.error("Fader: serial write failed:", err.message);
  });
}

function onLine(rawLine) {
  const line = rawLine.trim();
  if (!line) return;

  switch (line[0]) {
    case "R":
      console.log("Fader: board ready");
      faderStatus.ready = true;
      faderStatus.touched = false;
      lastTargetPos = null;
      syncFaderToAtem();
      break;
    case "P": {
      const position = parseInt(line.slice(1), 10);
      if (!Number.isNaN(position)) onPosition(position);
      break;
    }
    case "K":
      faderStatus.touched = line[1] === "1";
      if (faderStatus.touched) {
        lastTargetPos = null;
        movedWhileTouched = false;
      } else if (movedWhileTouched && faderStatus.position !== null) {
        // The hand moved it: the fader wins, including over any ATEM
        // change that arrived while it was held
        sendGainToAtem(positionToGain(faderStatus.position));
        sendGainToAtem.flush();
      } else {
        // Only rested a hand on it: catch up with the ATEM
        syncFaderToAtem();
      }
      break;
    default:
      console.log("Fader: unknown message:", line);
  }
}

// --- Connection ---

async function findPortPath() {
  if (FADER_PORT) return FADER_PORT;
  const ports = await SerialPort.list();
  const match = ports.find(
    (p) => p.vendorId && ARDUINO_VENDOR_IDS.includes(p.vendorId.toLowerCase())
  );
  return match ? match.path : null;
}

function scheduleReconnect() {
  if (reconnectTimer) return; // prevent duplicate timers
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_MS);
}

async function connect() {
  let path;
  try {
    path = await findPortPath();
  } catch (err) {
    console.error("Fader: listing serial ports failed:", err.message);
  }
  if (!path) {
    scheduleReconnect();
    return;
  }

  port = new SerialPort({ path, baudRate: FADER_BAUD, autoOpen: false });
  const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));
  parser.on("data", onLine);

  port.on("close", () => {
    faderStatus.connected = false;
    faderStatus.ready = false;
    faderStatus.touched = false;
    console.log(`Fader: ${path} closed, retrying in ${RECONNECT_MS / 1000}s...`);
    scheduleReconnect();
  });

  port.on("error", (err) => {
    console.error("Fader: serial error:", err.message);
  });

  port.open((err) => {
    if (err) {
      console.log(`Fader: cannot open ${path} (${err.message}), retrying...`);
      scheduleReconnect();
      return;
    }
    // Opening the port resets the Uno; it sends R once it has booted
    faderStatus.connected = true;
    console.log(`Fader: connected on ${path}`);
  });
}

function startFader(atemDevice) {
  atem = atemDevice;
  atem.on("connected", () => {
    if (isAtemReady()) {
      console.log(
        `Fader: ATEM master gain ${atem.state.fairlight.master.properties.faderGain} (1/100 dB)`
      );
    }
    syncFaderToAtem();
  });
  atem.on("stateChanged", onAtemStateChanged);
  connect();
}

module.exports = { startFader, faderStatus, positionToGain, gainToPosition };

const { SerialPort, ReadlineParser } = require("serialport");

// Motorized faders (Arduino Uno running fader.ino) <-> ATEM Fairlight gains.
// Protocol, 115200 baud, newline-terminated ASCII; <ch> = fader channel 0..n-1:
//   board -> host   R<n> (ready, n faders)   P<ch>:<0-1023> (position)
//                   K<ch>:1 / K<ch>:0 (touch)
//   host -> board   T<ch>:<0-1023> (move to target)   S<ch> / S (stop one / all)
//                   ? (who's there: board answers R<n> + positions)
//                   L<ch>:<left>:<right> (audio levels for the board's meter,
//                     0.1 dB, -600 = -60 dB = silence; forwarded at the
//                     ATEM's ~25/s, not shown by FADER_DEBUG)
// Hardware and firmware live in the atem-motorfader project.

const FADER_PORT = process.env.FADER_PORT || ""; // empty = auto-detect
const FADER_BAUD = parseInt(process.env.FADER_BAUD, 10) || 115200;
// Comma-separated ATEM target per fader channel, in channel order:
// master, mic1, mic2, or <input>/<source> such as 1301/-65280
const FADER_CHANNELS = process.env.FADER_CHANNELS || "master";
// FADER_DEBUG=1 logs every serial line in both directions
const FADER_DEBUG = process.env.FADER_DEBUG === "1";

// Fairlight gains are integers in hundredths of a dB (atem-connection
// passes faderGain to the wire as a raw int32). -10000 (-100 dB) is the
// bottom of the range and reads as -infinity.
const GAIN_MIN = -10000;

// Meter levels on the wire: 0.1 dB, clamped to -60..0 dB
const LEVEL_FLOOR = -600;

// Taper: [position 0..1, dB], matching the fader in ATEM Software Control
// (Fairlight), so the physical fader sits at the same height and both move
// together. Measured from screenshots, 2026-11-15: its scale is even from
// +10 dB at the top down to -20 dB at 33 % (10 dB per dot), then steep:
// -46 dB at 16.5 %, -inf at the bottom. Below -46 dB it is interpolated.
const TAPER = [
  [0, -100],
  [0.165, -46],
  [0.33, -20],
  [0.555, -10],
  [0.78, 0],
  [1, 10],
];

const POS_MAX = 1023;
const SEND_INTERVAL_MS = 25; // throttle for both directions
const ECHO_TOLERANCE_GAIN = 10; // 0.1 dB: ATEM echoing our own value back
const SETTLE_TOLERANCE_POS = 8; // counts: fader stopped close enough to target
const MOVE_TIMEOUT_MS = 1500; // firmware gives up after 1 s
const RECONNECT_MS = 5000;
const HELLO_RETRY_MS = 2000; // resend ? until the board answers R<n>
const HELLO_TRIES = 5;

// USB vendor IDs: Arduino (2341, 2a03), CH340 clones (1a86), FTDI (0403)
const ARDUINO_VENDOR_IDS = ["2341", "2a03", "1a86", "0403"];

// Fairlight mic inputs on the ATEM Mini; -65280 is the mono/stereo source
// (from the earlier Mic-1 code, commit e5b8271).
const NAMED_TARGETS = {
  mic1: "1301/-65280",
  mic2: "1302/-65280",
};

const faderStatus = {
  connected: false, // serial port open
  ready: false, // board has booted and sent R<n>
  boardFaders: null, // fader count the board reported
  channels: [], // per channel: { target, touched, position }
};

let atem = null;
let port = null;
let reconnectTimer = null;
let helloTimer = null;

// --- ATEM targets ---

function masterTarget() {
  return {
    name: "master",
    statePath: "fairlight.master",
    matchesLevels: (e) => e.type === "master",
    getGain: (state) => state?.fairlight?.master?.properties?.faderGain,
    setGain: (gain) => atem.setFairlightAudioMixerMasterProps({ faderGain: gain }),
  };
}

function sourceTarget(name, input, source) {
  return {
    name,
    statePath: `fairlight.inputs.${input}.sources.${source}`,
    matchesLevels: (e) =>
      e.type === "source" && e.index === input && String(e.source) === source,
    getGain: (state) =>
      state?.fairlight?.inputs?.[input]?.sources?.[source]?.properties?.faderGain,
    setGain: (gain) =>
      atem.setFairlightAudioMixerSourceProps(input, source, { faderGain: gain }),
  };
}

function parseTarget(spec) {
  if (spec === "master") return masterTarget();
  const resolved = NAMED_TARGETS[spec] || spec;
  const match = /^(\d+)\/(-?\d+)$/.exec(resolved);
  if (!match) throw new Error(`Fader: unknown channel target "${spec}"`);
  return sourceTarget(spec, parseInt(match[1], 10), match[2]);
}

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
  const db = Math.min(Math.max(gain / 100, taperDb[0]), taperDb[taperDb.length - 1]);
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

// --- One fader channel ---

function createChannel(index, target) {
  const status = { target: target.name, touched: false, position: null };

  let movedWhileTouched = false;
  let lastSentGain = null; // last gain we sent to the ATEM
  let lastAtemGain = null; // last gain the ATEM reported
  let lastTargetPos = null; // last T<ch>:<n> we sent to the fader
  let moveStartedAt = 0;

  function atemGain() {
    return atem ? target.getGain(atem.state) : undefined;
  }

  function isAtemReady() {
    return typeof atemGain() === "number";
  }

  // --- Fader -> ATEM ---

  const sendGainToAtem = throttle((gain) => {
    if (!isAtemReady()) return;
    lastSentGain = gain;
    target.setGain(gain).catch((err) => {
      console.error(`Fader ${index}: failed to set ATEM ${target.name} gain:`, err.message);
    });
  }, SEND_INTERVAL_MS);

  function moveInProgress() {
    return lastTargetPos !== null && Date.now() - moveStartedAt < MOVE_TIMEOUT_MS;
  }

  function onPosition(position) {
    status.position = position;

    if (!status.touched) {
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
    if (status.touched) movedWhileTouched = true;
    sendGainToAtem(positionToGain(position));
  }

  // --- ATEM -> fader ---

  const sendTargetToFader = throttle((position) => {
    if (!faderStatus.ready) return;
    lastTargetPos = position;
    moveStartedAt = Date.now();
    writeLine(`T${index}:${position}`);
  }, SEND_INTERVAL_MS);

  function syncToAtem() {
    if (!isAtemReady() || !faderStatus.ready || status.touched) return;
    const gain = atemGain();
    lastAtemGain = gain;
    sendTargetToFader(gainToPosition(gain));
  }

  function onAtemStateChanged(pathToChange) {
    const changed = pathToChange.some(
      (p) => p === target.statePath || p.startsWith(`${target.statePath}.`)
    );
    if (!changed || !isAtemReady()) return;

    const gain = atemGain();
    if (gain === lastAtemGain) return; // e.g. a dynamics/EQ change on the same command
    lastAtemGain = gain;

    // Our own value coming back
    if (lastSentGain !== null && Math.abs(gain - lastSentGain) <= ECHO_TOLERANCE_GAIN) {
      return;
    }
    lastSentGain = null;

    if (status.touched) return; // the hand wins
    sendTargetToFader(gainToPosition(gain));
  }

  function onTouch(touched) {
    status.touched = touched;
    if (touched) {
      lastTargetPos = null;
      movedWhileTouched = false;
    } else if (movedWhileTouched && status.position !== null) {
      // The hand moved it: the fader wins, including over any ATEM
      // change that arrived while it was held
      sendGainToAtem(positionToGain(status.position));
      sendGainToAtem.flush();
    } else {
      // Only rested a hand on it: catch up with the ATEM
      syncToAtem();
    }
  }

  function reset() {
    status.touched = false;
    lastTargetPos = null;
  }

  // ATEM level (1/100 dB) -> meter level on the wire (0.1 dB)
  function meterLevel(level) {
    return Math.min(Math.max(Math.round(level / 10), LEVEL_FLOOR), 0);
  }

  function onLevels(event) {
    if (!faderStatus.ready || !target.matchesLevels(event)) return;
    const { leftLevel, rightLevel } = event.levels;
    writeLine(`L${index}:${meterLevel(leftLevel)}:${meterLevel(rightLevel)}`);
  }

  function logGain() {
    if (isAtemReady()) {
      console.log(`Fader ${index}: ATEM ${target.name} gain ${atemGain()} (1/100 dB)`);
    }
  }

  return {
    status,
    onPosition,
    onTouch,
    onAtemStateChanged,
    onLevels,
    syncToAtem,
    reset,
    logGain,
  };
}

const channels = FADER_CHANNELS.split(",")
  .map((spec) => spec.trim())
  .filter(Boolean)
  .map((spec, index) => createChannel(index, parseTarget(spec)));
faderStatus.channels = channels.map((channel) => channel.status);

// --- Serial line handling ---

function writeLine(line) {
  if (!port || !port.isOpen) return;
  if (FADER_DEBUG && line[0] !== "L") console.log(`Fader >> ${line}`);
  port.write(`${line}\n`, (err) => {
    if (err) console.error("Fader: serial write failed:", err.message);
  });
}

// "<ch>:<value>" after the command letter -> [channel, value], or null
function parseChannelValue(rest) {
  const match = /^(\d+):(\d+)$/.exec(rest);
  if (!match) return null;
  const channel = channels[parseInt(match[1], 10)];
  return channel ? [channel, parseInt(match[2], 10)] : null;
}

function onLine(rawLine) {
  // Drop non-printable bytes: a board that just reset can send noise before
  // its first line (seen as "\u00ff\u0000...R1" after flashing the ESP32)
  const line = rawLine.replace(/[^\x20-\x7e]/g, "").trim();
  if (!line) return;
  if (FADER_DEBUG) console.log(`Fader << ${line}`);

  switch (line[0]) {
    case "R": {
      const boardFaders = parseInt(line.slice(1), 10);
      faderStatus.boardFaders = Number.isNaN(boardFaders) ? null : boardFaders;
      console.log(`Fader: board ready, ${line.slice(1) || "?"} fader(s)`);
      if (faderStatus.boardFaders !== null && faderStatus.boardFaders !== channels.length) {
        console.log(
          `Fader: FADER_CHANNELS lists ${channels.length} channel(s), the board has ${faderStatus.boardFaders}`
        );
      }
      faderStatus.ready = true;
      channels.forEach((channel) => {
        channel.reset();
        channel.syncToAtem();
      });
      break;
    }
    case "P": {
      const parsed = parseChannelValue(line.slice(1));
      if (parsed) parsed[0].onPosition(parsed[1]);
      break;
    }
    case "K": {
      const parsed = parseChannelValue(line.slice(1));
      if (parsed) parsed[0].onTouch(parsed[1] === 1);
      break;
    }
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
    clearTimeout(helloTimer);
    faderStatus.connected = false;
    faderStatus.ready = false;
    channels.forEach((channel) => channel.reset());
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
    // Opening the port resets the Uno, which then sends R<n> by itself. An
    // ESP32 board keeps running, so ask with "?" until R<n> arrives (an Uno
    // still in its bootloader ignores it).
    faderStatus.connected = true;
    console.log(`Fader: connected on ${path}`);
    let tries = 0;
    const hello = () => {
      if (faderStatus.ready || !port.isOpen || tries++ >= HELLO_TRIES) return;
      writeLine("?");
      helloTimer = setTimeout(hello, HELLO_RETRY_MS);
    };
    helloTimer = setTimeout(hello, 100);
  });
}

function startFader(atemDevice) {
  atem = atemDevice;
  atem.on("connected", () => {
    channels.forEach((channel) => {
      channel.logGain();
      channel.syncToAtem();
    });
    // Ask the ATEM to stream Fairlight levels (for the board's OLED meter)
    atem.startFairlightMixerSendLevels().catch((err) => {
      console.error("Fader: cannot start ATEM level stream:", err.message);
    });
  });
  atem.on("levelChanged", (event) => {
    if (event.system !== "fairlight") return;
    channels.forEach((channel) => channel.onLevels(event));
  });
  atem.on("stateChanged", (state, pathToChange) => {
    channels.forEach((channel) => channel.onAtemStateChanged(pathToChange));
  });
  connect();
}

module.exports = { startFader, faderStatus, positionToGain, gainToPosition };

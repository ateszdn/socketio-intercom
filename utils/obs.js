const OBSWebSocket = require("obs-websocket-js").default;

const obs = new OBSWebSocket();

const OBS_URL = process.env.OBS_URL || "ws://localhost:4455";
const OBS_PASSWORD = process.env.OBS_PASSWORD || "";

// Track OBS streaming/recording state
const obsStatus = {
  streaming: false,
  recording: false,
  connected: false,
};

let reconnectTimer = null;

function scheduleReconnect() {
  if (reconnectTimer) return; // prevent duplicate timers
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 10000);
}

async function connect() {
  try {
    await obs.connect(OBS_URL, OBS_PASSWORD || undefined);
    obsStatus.connected = true;
    console.log("Connected to OBS WebSocket");

    const streamStatus = await obs.call("GetStreamStatus");
    obsStatus.streaming = streamStatus.outputActive;

    const recordStatus = await obs.call("GetRecordStatus");
    obsStatus.recording = recordStatus.outputActive;

    console.log(
      `  OBS streaming: ${obsStatus.streaming}, recording: ${obsStatus.recording}`
    );

    // Restart preview if a callback is registered (reconnect case)
    if (previewCallback && !previewInterval) {
      startPreview();
    }
  } catch (_err) {
    obsStatus.connected = false;
    console.log("OBS WebSocket not available, retrying in 10s...");
    scheduleReconnect();
  }
}

// Reconnect on disconnect
obs.on("ConnectionClosed", () => {
  obsStatus.connected = false;
  obsStatus.streaming = false;
  obsStatus.recording = false;
  stopPreview();
  console.log("OBS WebSocket disconnected, retrying in 10s...");
  scheduleReconnect();
});

// Streaming state changes
obs.on("StreamStateChanged", (event) => {
  obsStatus.streaming = event.outputActive;
  console.log(`OBS streaming: ${obsStatus.streaming}`);
});

// Recording state changes
obs.on("RecordStateChanged", (event) => {
  obsStatus.recording = event.outputActive;
  console.log(`OBS recording: ${obsStatus.recording}`);
});

// --- Program preview screenshot ---

const PREVIEW_INTERVAL = parseInt(process.env.OBS_PREVIEW_INTERVAL, 10) || 3000;
const PREVIEW_WIDTH = parseInt(process.env.OBS_PREVIEW_WIDTH, 10) || 320;
const PREVIEW_QUALITY = parseInt(process.env.OBS_PREVIEW_QUALITY, 10) || 30;

let previewInterval = null;
let previewCallback = null;

function onPreview(callback) {
  previewCallback = callback;
}

function startPreview() {
  if (previewInterval) return;
  if (!obsStatus.connected) return;
  console.log("OBS preview started");
  previewInterval = setInterval(async () => {
    if (!obsStatus.connected || !previewCallback) {
      stopPreview();
      return;
    }
    try {
      const { currentProgramSceneName } = await obs.call("GetCurrentProgramScene");
      const response = await obs.call("GetSourceScreenshot", {
        sourceName: currentProgramSceneName,
        imageFormat: "jpg",
        imageWidth: PREVIEW_WIDTH,
        imageCompressionQuality: PREVIEW_QUALITY,
      });
      previewCallback(response.imageData);
    } catch (err) {
      console.error("OBS preview error:", err.message || err);
    }
  }, PREVIEW_INTERVAL);
}

function stopPreview() {
  if (previewInterval) {
    clearInterval(previewInterval);
    previewInterval = null;
  }
}

connect();

module.exports = { obs, obsStatus, onPreview, startPreview, stopPreview };

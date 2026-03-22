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

async function connect() {
  try {
    await obs.connect(OBS_URL, OBS_PASSWORD || undefined);
    obsStatus.connected = true;
    console.log("Connected to OBS WebSocket");

    // Get initial streaming/recording state
    const streamStatus = await obs.call("GetStreamStatus");
    obsStatus.streaming = streamStatus.outputActive;

    const recordStatus = await obs.call("GetRecordStatus");
    obsStatus.recording = recordStatus.outputActive;

    console.log(
      `  OBS streaming: ${obsStatus.streaming}, recording: ${obsStatus.recording}`
    );
  } catch (_err) {
    obsStatus.connected = false;
    console.log("OBS WebSocket not available, retrying in 10s...");
    setTimeout(connect, 10000);
  }
}

// Reconnect on disconnect
obs.on("ConnectionClosed", () => {
  console.log("OBS WebSocket disconnected, retrying in 10s...");
  obsStatus.connected = false;
  obsStatus.streaming = false;
  obsStatus.recording = false;
  setTimeout(connect, 10000);
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
  console.log("OBS preview started (interval: %dms, width: %dpx, quality: %d)", PREVIEW_INTERVAL, PREVIEW_WIDTH, PREVIEW_QUALITY);
  previewInterval = setInterval(async () => {
    if (!obsStatus.connected) { return; }
    if (!previewCallback) { return; }
    try {
      const { currentProgramSceneName } = await obs.call("GetCurrentProgramScene");
      console.log("OBS preview: capturing scene '%s'", currentProgramSceneName);
      const response = await obs.call("GetSourceScreenshot", {
        sourceName: currentProgramSceneName,
        imageFormat: "jpg",
        imageWidth: PREVIEW_WIDTH,
        imageCompressionQuality: PREVIEW_QUALITY,
      });
      console.log("OBS preview: got image (%d bytes)", response.imageData.length);
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

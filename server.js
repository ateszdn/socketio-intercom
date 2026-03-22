require("dotenv").config();

const PORT = process.env.PORT || 3101;

const cors = require("cors");
const express = require("express");
const fs = require("fs");
const path = require("path");
const socketio = require("socket.io");
const QRCode = require("qrcode");
const bodyParser = require("body-parser");

const printMyDate = require("./utils/utils");
const localNetwork = require("./utils/localNetwork");
const AtemDevice = require("./utils/atem");

const btnData = require("./json/btnData.json");
const camBtns = btnData.camBtns;
const messageBtns = btnData.messageBtns;

// Derive server address from first local network IP
const serverIP = localNetwork[0];
const clientAddress = `http://${serverIP}:${PORT}/`;

// --- Express setup ---

const app = express();
app.use(bodyParser.json({ limit: "10mb" }));
app.use(cors());

app.use("/static", express.static("static"));
app.use("/json", express.static("json"));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

const expressServer = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  fs.appendFileSync(
    "log.txt",
    `${printMyDate()}\nServer running on port ${PORT}\nLocal network IPs: ${localNetwork}\n\n`
  );
});

const io = socketio(expressServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// --- Message persistence ---

let messages = [];

function loadMessages() {
  try {
    const data = fs.readFileSync("./json/messages.json", "utf8");
    messages = JSON.parse(data);
  } catch (err) {
    console.error("Failed to load messages:", err.message);
  }
}

function saveMessages() {
  try {
    fs.writeFileSync("./json/messages.json", JSON.stringify(messages));
  } catch (err) {
    console.error("Failed to save messages:", err.message);
  }
}

loadMessages();

// --- Routes ---

app.get("/", (req, res) => {
  res.redirect("/admin");
});

app.get("/admin", (req, res) => {
  res.render("admin", {
    title: "Admin",
    messages: messages,
    camBtns: camBtns,
    messageBtns: messageBtns,
  });
});

app.post("/save-image", async (req, res) => {
  const dataUrl = req.body.dataUrl;
  if (!dataUrl || !dataUrl.startsWith("data:image/webp;base64,")) {
    return res.status(400).send("Invalid image data");
  }

  const base64Data = dataUrl.replace(/^data:image\/webp;base64,/, "");
  const screenshotDir = path.join(__dirname, "static", "images", "screenshot");

  // Clean up old screenshots before writing the new one
  try {
    const files = await fs.promises.readdir(screenshotDir);
    await Promise.all(
      files.map((file) => fs.promises.unlink(path.join(screenshotDir, file)))
    );
  } catch (err) {
    console.error("Failed to clean screenshot directory:", err.message);
  }

  const filename = `canvas-content-${Date.now()}.webp`;
  const imagePath = path.join(screenshotDir, filename);

  try {
    await fs.promises.writeFile(imagePath, base64Data, "base64");
    io.emit("imageSaved", {
      imagePath: `/static/images/screenshot/${filename}`,
    });
    res.send("Image saved");
  } catch (err) {
    console.error("Failed to save image:", err.message);
    res.status(500).send("Error saving image");
  }
});

// --- QR code generation ---

QRCode.toFile(
  "./static/qr/qrcode.svg",
  clientAddress,
  {
    type: "svg",
    color: { dark: "#000", light: "#fff" },
  },
  function (err) {
    if (err) console.error("Failed to generate QR code:", err.message);
  }
);

// --- ATEM helper ---

function getAtemStatus() {
  const state = AtemDevice.state;
  return {
    strmStatus: state.streaming && state.streaming.status.state !== 1,
    dskStatus: state.recording && state.recording.status.state !== 0,
    inputs: {
      previewInput: state.video.mixEffects[0].previewInput,
      programInput: state.video.mixEffects[0].programInput,
    },
  };
}

// --- Socket.IO ---

io.on("connection", (socket) => {
  console.log(socket.id, "has connected");

  // Send stored messages to new clients
  socket.emit("storedMessages", messages);

  // Send ATEM status if connected
  if (AtemDevice.connected) {
    socket.emit("getStreamingAndInputStatus", getAtemStatus());
  }

  socket.on("clientCam", (cam) => {
    loadMessages();
    const camIndex = messages.findIndex((item) => item.cam);
    if (camIndex !== -1) {
      messages[camIndex].cam = cam;
    } else {
      messages.push({ cam: cam });
    }
    saveMessages();
    io.emit("camBack", cam);
  });

  socket.on("clientMessage", (msg) => {
    loadMessages();
    const msgIndex = messages.findIndex((item) => item.msg);
    if (msgIndex !== -1) {
      messages[msgIndex].msg = msg;
    } else {
      messages.push({ msg: msg });
    }
    saveMessages();
    io.emit("messageBack", msg);
  });

  socket.on("clientReset", () => {
    loadMessages();
    messages = messages.filter((item) => !item.cam && !item.msg);
    saveMessages();
    io.emit("camBack", "reset");
    io.emit("messageBack", "reset");
  });
});

// --- ATEM state change broadcasting ---

AtemDevice.on("stateChanged", (state, pathToChange) => {
  if (!AtemDevice.connected) return;

  if (
    pathToChange.includes("streaming.status") ||
    pathToChange.includes("recording.status")
  ) {
    io.emit("streamingStatusChanged", {
      strmStatus: state.streaming && state.streaming.status.state !== 1,
      dskStatus: state.recording && state.recording.status.state !== 0,
    });
  }

  if (
    pathToChange.includes("video.mixEffects.0.previewInput") ||
    pathToChange.includes("video.mixEffects.0.programInput")
  ) {
    io.emit("InputChanged", {
      inputs: {
        previewInput: state.video.mixEffects[0].previewInput,
        programInput: state.video.mixEffects[0].programInput,
      },
    });
  }
});

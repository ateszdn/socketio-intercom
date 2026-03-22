const socket = io(window.location.origin);

socket.on("connect", () => {
  console.log("Connected:", socket.id);
});

let camBtns;
let messageBtns;

fetch("./json/btnData.json")
  .then((response) => response.json())
  .then((data) => {
    camBtns = data.camBtns;
    messageBtns = data.messageBtns;

    // Attach click listeners to message buttons from config
    if (typeof messageBtns === "object" && messageBtns !== null) {
      Object.keys(messageBtns).forEach((key) => {
        const button = document.querySelector(`#${key}`);
        if (button) {
          button.addEventListener("click", (event) => {
            socket.emit("clientMessage", event.target.id);
          });
        }
      });
    }
  })
  .catch((error) => console.error("Error loading button data:", error));

// --- Camera button listeners ---

document.querySelectorAll("#cam-1, #cam-2, #cam-3").forEach((button) => {
  button.addEventListener("click", (event) => {
    socket.emit("clientCam", event.target.id);
  });
});

const resetButton = document.querySelector("#reset");
if (resetButton) {
  resetButton.addEventListener("click", () => {
    socket.emit("clientReset");
  });
}

// --- Socket.IO event handlers ---

socket.on("camBack", (backdata) => {
  const camDisplay = document.querySelector("#cam-display");
  if (backdata === "reset") {
    camDisplay.style.backgroundImage = "";
    camDisplay.innerHTML = "CAM #";
  } else {
    camDisplay.style.backgroundImage = camBtns[backdata];
    camDisplay.innerHTML = "";
  }
});

socket.on("messageBack", (backmsg) => {
  const msgDisplay = document.querySelector("#message-display");
  if (backmsg === "reset") {
    msgDisplay.style.backgroundImage = "";
    msgDisplay.innerHTML = "MSG";
  } else {
    msgDisplay.style.backgroundImage = messageBtns[backmsg];
    msgDisplay.innerHTML = "";
  }
});

socket.on("imageSaved", (data) => {
  const msgDisplay = document.querySelector("#message-display");
  msgDisplay.style.backgroundImage = `url(${data.imagePath})`;
  msgDisplay.innerHTML = "";
});

socket.on("storedMessages", (messages) => {
  messages.forEach((message) => {
    if (message.cam) {
      document.querySelector("#cam-display").style.backgroundImage =
        camBtns[message.cam];
      document.querySelector("#cam-display").innerHTML = "";
    }
    if (message.msg) {
      document.querySelector("#message-display").style.backgroundImage =
        messageBtns[message.msg];
      document.querySelector("#message-display").innerHTML = "";
    }
  });
});

// --- ATEM streaming & tally lights ---

function setStreamLights(data) {
  const diskRecElement = document.getElementById("dskRec");
  const onAirElement = document.getElementById("onAir");
  const onAirFrameElement = document.getElementById("onAir-frame");

  onAirFrameElement.classList.toggle(
    "streaming",
    data.strmStatus === true || data.dskStatus === true
  );
  onAirElement.classList.toggle("streaming", data.strmStatus === true);
  diskRecElement.classList.toggle("streaming", data.dskStatus === true);
}

function setTallyLights(data) {
  // Reset all input indicators to default
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`input-${i}`);
    if (el) el.style.backgroundColor = "rgb(39, 39, 42)";
  }
  // Set preview (green) and program (red), with bounds check
  const previewEl = document.getElementById(
    `input-${data.inputs.previewInput}`
  );
  const programEl = document.getElementById(
    `input-${data.inputs.programInput}`
  );
  if (previewEl) previewEl.style.backgroundColor = "var(--color-green)";
  if (programEl) programEl.style.backgroundColor = "var(--color-red)";
}

socket.on("getStreamingAndInputStatus", (data) => {
  setStreamLights(data);
  setTallyLights(data);
});

socket.on("streamingStatusChanged", (data) => {
  setStreamLights(data);
});

socket.on("InputChanged", (data) => {
  setTallyLights(data);
});

// --- Canvas pan & zoom (image viewer) ---

const dialog = document.querySelector("dialog");
const openDialogButton = document.querySelector("#open-dialog");
const closeDialogButton = document.querySelector("#close-dialog");

if (openDialogButton) {
  openDialogButton.addEventListener("click", () => dialog.showModal());
}
if (closeDialogButton) {
  closeDialogButton.addEventListener("click", () => dialog.close());
}

const saveCanvasButton = document.getElementById("save-canvas");
if (saveCanvasButton) {
  saveCanvasButton.addEventListener("click", () => {
    const dataUrl = canvas.toDataURL("image/webp");
    fetch("/save-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl }),
    })
      .then((response) => response.text())
      .then(() => dialog.close())
      .catch((error) => console.error("Error saving image:", error));
  });
}

const canvas = document.getElementById("canvas");
let ctx;
if (canvas) {
  ctx = canvas.getContext("2d");
}

const cameraOffset = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let cameraZoom = 1;
const MAX_ZOOM = 5;
const MIN_ZOOM = 0.1;
const SCROLL_SENSITIVITY = 0.0005;

const image = new Image();
image.src = "/static/images/screenshot.webp";

function draw() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  ctx.translate(window.innerWidth / 2, window.innerHeight / 2);
  ctx.scale(cameraZoom, cameraZoom);
  ctx.translate(
    -window.innerWidth / 2 + cameraOffset.x,
    -window.innerHeight / 2 + cameraOffset.y
  );
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  const x = (window.innerWidth - image.width * cameraZoom) / 2;
  const y = (window.innerHeight - image.height * cameraZoom) / 2;
  ctx.drawImage(image, x, y, image.width * cameraZoom, image.height * cameraZoom);

  requestAnimationFrame(draw);
}

function getEventLocation(e) {
  if (e.touches && e.touches.length === 1) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  } else if (e.clientX && e.clientY) {
    return { x: e.clientX, y: e.clientY };
  }
}

let isDragging = false;
const dragStart = { x: 0, y: 0 };

function onPointerDown(e) {
  isDragging = true;
  dragStart.x = getEventLocation(e).x / cameraZoom - cameraOffset.x;
  dragStart.y = getEventLocation(e).y / cameraZoom - cameraOffset.y;
}

function onPointerUp() {
  isDragging = false;
  initialPinchDistance = null;
  lastZoom = cameraZoom;
}

function onPointerMove(e) {
  if (isDragging) {
    cameraOffset.x = getEventLocation(e).x / cameraZoom - dragStart.x;
    cameraOffset.y = getEventLocation(e).y / cameraZoom - dragStart.y;
  }
}

function handleTouch(e, singleTouchHandler) {
  if (e.touches.length === 1) {
    singleTouchHandler(e);
  } else if (e.type === "touchmove" && e.touches.length === 2) {
    isDragging = false;
    handlePinch(e);
  }
}

let initialPinchDistance = null;
let lastZoom = cameraZoom;

function handlePinch(e) {
  e.preventDefault();

  const touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  const touch2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
  const currentDistance =
    (touch1.x - touch2.x) ** 2 + (touch1.y - touch2.y) ** 2;

  if (initialPinchDistance === null) {
    initialPinchDistance = currentDistance;
  } else {
    adjustZoom(null, currentDistance / initialPinchDistance);
  }
}

function adjustZoom(zoomAmount, zoomFactor) {
  if (!isDragging) {
    if (zoomAmount) {
      cameraZoom += zoomAmount;
    } else if (zoomFactor) {
      cameraZoom = zoomFactor * lastZoom;
    }
    cameraZoom = Math.min(cameraZoom, MAX_ZOOM);
    cameraZoom = Math.max(cameraZoom, MIN_ZOOM);
  }
}

if (canvas) {
  canvas.addEventListener("mousedown", onPointerDown);
  canvas.addEventListener("touchstart", (e) => handleTouch(e, onPointerDown));
  canvas.addEventListener("mouseup", onPointerUp);
  canvas.addEventListener("touchend", (e) => handleTouch(e, onPointerUp));
  canvas.addEventListener("mousemove", onPointerMove);
  canvas.addEventListener("touchmove", (e) => handleTouch(e, onPointerMove));
  canvas.addEventListener("wheel", (e) =>
    adjustZoom(e.deltaY * SCROLL_SENSITIVITY)
  );
  draw();
}

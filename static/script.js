// console.log(io)
console.log(window.location.origin);
const socket = io(window.location.origin);
// console.log(socket)
socket.on("connect", () => {
  console.log(socket.id);
  socket.emit("hi");
});

socket.on("message", (arg) => {
  console.log(arg);
});

let newBackground = "";
let camText = "";
let msgText = "";
camBackground = {
  "cam-1": "url('/static/images/cam1.svg')",
  "cam-2": "url('/static/images/cam2.svg')",
  "cam-3": "url('/static/images/cam3.svg')",
};
messageBackground = {
  "ok": "url('/static/images/msg-OK.svg')",
  "zoom-in": "url('/static/images/msg-Zoom-IN.svg')",
  "zoom-out": "url('/static/images/msg-Zoom-OUT.svg')",
  "brightness-up": "url('/static/images/msg-Brightness-UP.svg')",
  "brightness-down": "url('/static/images/msg-Brightness-DOWN.svg')",
  "focus-ok": "url('/static/images/msg-Focus-OK.svg')",
  "focus-off": "url('/static/images/msg-Focus-OFF.svg')",
};

// write a new event listener for the "camBack" event that changes the background image of the #cam-display div to the image that is stored in a local object whose key is the value of the "cam" event
socket.on("camBack", (backdata) => {
  newBackground = camBackground[backdata];
  console.log(newBackground);
  if (backdata == "reset") {
    newBackground = "";
    camText = "CAM #";
  } else {
    camText = "";
  }
  document.querySelector("#cam-display").style.backgroundImage = newBackground;
  document.querySelector("#cam-display").innerHTML = camText;
});
/*
socket.on("messageBack", (backmsg) => {
  console.log(backmsg);
  if (backmsg == "reset") {
    backmsg = "MSG";
  }
  document.querySelector("#message-display").innerHTML = backmsg;
});
*/
socket.on("messageBack", (backmsg) => {
  newBackground = messageBackground[backmsg];
  console.log(newBackground);
  if (backmsg == "reset") {
    newBackground = "";
    msgText = "MSG";
  } else {
    msgText = "";
  }
  document.querySelector("#message-display").style.backgroundImage = newBackground;
  document.querySelector("#message-display").innerHTML = msgText;
});

/*
document.querySelector('.button').addEventListener('click', (event) => {
  console.log(event.target)
  socket.emit('clientMessage', 'red')
})
*/

document.querySelectorAll("#cam-1, #cam-2, #cam-3").forEach((button) => {
  button.addEventListener("click", (event) => {
    console.log("Button clicked:", event.target.id);
    socket.emit("clientCam", event.target.id);
  });
});

document.querySelectorAll("#ok, #zoom-in, #zoom-out, #brightness-up, #brightness-down, #focus-ok, #focus-off").forEach((button) => {
  button.addEventListener("click", (event) => {
    socket.emit("clientMessage", event.target.id);
  });
});

document.querySelector("#reset").addEventListener("click", (event) => {
  socket.emit("clientReset");
});


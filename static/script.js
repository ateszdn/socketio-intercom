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

let camBtns;
let messageBtns;

fetch('./json/btnData.json')
  .then(response => {
    console.log(response);
    return response.json();
  })
  .then(data => {
    camBtns = data.camBtns;
    console.log(`camBtns: ${camBtns}`);
    messageBtns = data.messageBtns;

    // Add event listeners after fetch is complete
    if (typeof messageBtns === 'object' && messageBtns !== null) {
      Object.keys(messageBtns).forEach((key) => {
        let button = document.querySelector(`#${key}`);
        if (button) {
          button.addEventListener("click", (event) => {
            socket.emit("clientMessage", event.target.id);
          });
        }
      });
    } else {
      console.error('messageBtns is not defined or not an object');
    }
  })
  .catch((error) => console.error('Error:', error));
/*
camBtns = {
  "cam-1": "url('/static/images/cam1.svg')",
  "cam-2": "url('/static/images/cam2.svg')",
  "cam-3": "url('/static/images/cam3.svg')",
};
messageBtns = {
  "ok": "url('/static/images/msg-OK.svg')",
  "zoom-in": "url('/static/images/msg-Zoom-IN.svg')",
  "zoom-out": "url('/static/images/msg-Zoom-OUT.svg')",
  "brightness-up": "url('/static/images/msg-Brightness-UP.svg')",
  "brightness-down": "url('/static/images/msg-Brightness-DOWN.svg')",
  "focus-ok": "url('/static/images/msg-Focus-OK.svg')",
  "focus-off": "url('/static/images/msg-Focus-OFF.svg')",
};
*/
socket.on("camBack", (backdata) => {
  newBackground = camBtns[backdata];
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
  newBackground = messageBtns[backmsg];
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

/* 
document.querySelectorAll("#ok, #zoom-in, #zoom-out, #brightness-up, #brightness-down, #focus-ok, #focus-off").forEach((button) => {
  button.addEventListener("click", (event) => {
    socket.emit("clientMessage", event.target.id);
  });
});
 */

document.querySelector("#reset").addEventListener("click", (event) => {
  socket.emit("clientReset");
});


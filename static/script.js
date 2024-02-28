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
divBackground = {
  "cam-1": "url('/static/images/cam1.svg')",
  "cam-2": "url('/static/images/cam2.svg')",
  "cam-3": "url('/static/images/cam3.svg')",
};
// write a new event listener for the "camBack" event that changes the background image of the #cam-display div to the image that is stored in a local object whose key is the value of the "cam" event
socket.on("camBack", (backdata) => {
  newBackground = divBackground[backdata];
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

socket.on("messageBack", (backmsg) => {
  console.log(backmsg);
  if (backmsg == "reset") {
    backmsg = "MSG";
  }
  document.querySelector("#message-display").innerHTML = backmsg;
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

document.querySelectorAll("#focus, #total, #kozeli").forEach((button) => {
  button.addEventListener("click", (event) => {
    socket.emit("clientMessage", event.target.id);
  });
});

document.querySelector("#reset").addEventListener("click", (event) => {
  socket.emit("clientReset");
});


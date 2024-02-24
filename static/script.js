// console.log(io)
const socket = io(window.location.href);
// console.log(socket)
socket.on("connect", () => {
  console.log(socket.id);
  socket.emit("hi");
});

socket.on("message", (arg) => {
  console.log(arg);
});

socket.on("camBack", (backdata) => {
  console.log(backdata);
  document.querySelector("#cam-display").innerHTML = backdata;
});

socket.on("messageBack", (backmsg) => {
  console.log(backmsg);
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

document.querySelectorAll("#---, #focus, #total, #kozeli").forEach((button) => {
  button.addEventListener("click", (event) => {
    socket.emit("clientMessage", event.target.id);
  });
});

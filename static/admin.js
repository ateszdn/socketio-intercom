// NEM KELL

// console.log(io)
const socket = io("http://localhost:3000");
// console.log(socket)
socket.on("connect", () => {
  console.log(socket.id);
});
socket.on("message", (arg) => {
  console.log(arg);
  document.querySelector("#display").innerHTML = arg;
});
socket.on("clientMessage", (data) => {
  console.log(data);
  document.querySelector("#display").innerHTML = data;
});
socket.on("hi", () => {
  console.log("##### HI #####");
});

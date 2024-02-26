const PORT = process.env.PORT || 3000;

const cors = require("cors");
const express = require("express");
const path = require("path");
const socketio = require("socket.io");

const app = express();
// Use CORS middleware to allow all cross-origin requests
app.use(cors());
//const expressServer = app.listen(3000)
const expressServer = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
const io = socketio(expressServer, {
  cors: {
    origin: "*", // Adjust accordingly to your needs
    methods: ["GET", "POST"],
  },
});

const data = "";

//app.use(express.static(__dirname + '/public'))
//app.use(express.static("static"));
app.use('/static', express.static('static'))
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

app.get("/", (req, res) => {
  res.render("index", { title: "Intercom", message: "Intercom" });
});
app.get("/admin", (req, res) => {
  res.render("admin", {
    title: "Admin",
    message: "Dashboard",
    classname: data,
  });
});

io.on("connection", (socket) => {
  console.log(socket.id, "has connected");
  socket.broadcast.emit("message", `${socket.id} HAS CONNECTED`);
  socket.on("hi", () => {
    console.log("##### HI #####");
  });
  socket.on("clientCam", (cam) => {
    console.log("CAM:", cam);
    io.emit("camBack", cam);
  });
  socket.on("clientMessage", (msg) => {
    console.log("MESSAGE:", msg);
    io.emit("messageBack", msg);
  });
  socket.on("clientReset", () => {
    console.log("RESET");
    io.emit("camBack", "reset");
    io.emit("messageBack", "reset");
  });
});

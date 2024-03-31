const PORT = process.env.PORT || 3000;

const cors = require("cors");
const express = require("express");

const fs = require("fs");
const path = require("path");

const printMyDate = require("./utils/utils");
const localNetwork = require("./utils/localNetwork");

const socketio = require("socket.io");

const QRCode = require('qrcode')

const bodyParser = require('body-parser');


// Get the clientAddress
const serverIP = localNetwork[0];
const clientAddress = `http://${serverIP}:${PORT}/`;

// Read the index_template.html file
fs.readFile(path.join(__dirname, 'public', 'index_template.html'), 'utf8', (err, data) => {
  if (err) {
    console.error(err);
    return;
  }

  // Replace a placeholder in the file with the clientAddress
  let result = data.replace(/__CLIENT_ADDRESS__/g, clientAddress);

  // Write the result to index.html
  fs.writeFile(path.join(__dirname, 'public', 'index.html'), result, 'utf8', (err) => {
    if (err) {
      console.error(err);
    }
  });
});


fs.appendFileSync("log.txt", `${printMyDate()}\nServer running at http://${serverIP}:${PORT}/\n\n`)
// Create an Express application

const app = express();

app.use(bodyParser.json({ limit: '50mb' }));

// Use CORS middleware to allow all cross-origin requests
app.use(cors());
//const expressServer = app.listen(3000)
const expressServer = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Local network IPs:", localNetwork);
  fs.appendFileSync("log.txt", `${printMyDate()}\nServer running on port ${PORT}\nLocal network IPs: ${localNetwork}\n\n`)
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
app.use('/static', express.static('static'));
app.use('/json', express.static('json'));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

app.get("/", (req, res) => {
  res.render("index", { title: "Intercom", message: "Intercom" });
});
app.get("/admin", (req, res) => {
  res.render("admin", {
    title: "Admin",
    message: "Dashboard",
    camBtns: camBtns,
    messageBtns: messageBtns
  });
});
// save the image from the canvas
app.post('/save-image', (req, res) => {
  let dataUrl = req.body.dataUrl;
  let base64Data = dataUrl.replace(/^data:image\/webp;base64,/, "");

  // Generate a unique filename using a timestamp
  let timestamp = Date.now();
  let filename = `canvas-content-${timestamp}.webp`;
  let imagePath = path.join(__dirname, 'static', 'images', 'screenshot', filename);

  fs.writeFile(imagePath, base64Data, 'base64', (err) => {
    if (err) {
      console.log(err);
      res.status(500).send('Error saving image');
    } else {
      // Emit a socket.io event with the image path
      io.emit('imageSaved', { imagePath: `/static/images/screenshot/${filename}` });
      res.send('Image saved');
    }
  });
});



// write the QR code to a file
//QRCode.toFile(path.join(__dirname, 'static', 'qrcode.svg'), clientAddress, {
QRCode.toFile('./static/qr/qrcode.svg', clientAddress, {
  type: 'svg',
  color: {
    dark: '#000',  // dark gray dots
    light: '#fff' // white bg
    //light: '#0000' // Transparent background
  }
}, function (err) {
  if (err) throw err
  console.log('saved qr code to qrcode.svg')
})


const btnData = require('./json/btnData.json');
const printDate = require('./utils/utils');
let camBtns = btnData.camBtns;
let messageBtns = btnData.messageBtns;

io.on("connection", (socket) => {
  console.log(socket.id, "has connected");
  socket.broadcast.emit("message", `${socket.id} HAS CONNECTED`);
  socket.on("hi", () => {
    fs.appendFileSync("log.txt", `${printMyDate()}\n${socket.id} HAS CONNECTED\n\n`)
    console.log("##### HI #####");
  });
  socket.on("clientCam", (cam) => {
    console.log("CAM:", cam);
    io.emit("camBack", cam);
  });
  socket.on("clientMessage", (msg) => {
    console.log("MESSAGE:", msg);
    fs.appendFileSync("log.txt", `Message: ${msg}\n`)
    io.emit("messageBack", msg);
  });
  socket.on("clientReset", () => {
    console.log("RESET");
    io.emit("camBack", "reset");
    io.emit("messageBack", "reset");
  });
});

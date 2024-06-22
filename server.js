const PORT = process.env.PORT || 3000;

const cors = require("cors");
const express = require("express");

const fs = require("fs");
const path = require("path");

const printMyDate = require("./utils/utils");
const localNetwork = require("./utils/localNetwork");
const myAtem = require("./utils/atem");

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
// Store messages in an array to send to new clients
let messages = [];

//app.use(express.static(__dirname + '/public'))
//app.use(express.static("static"));
app.use('/static', express.static('static'));
app.use('/json', express.static('json'));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

app.get("/", (req, res) => {
  res.render("index", { title: "Intercom", messages: messages });
});
app.get("/admin", (req, res) => {
  res.render("admin", {
    title: "Admin",
    messages: messages,
    camBtns: camBtns,
    messageBtns: messageBtns
  });
});
// Get the messages from the server as JSON
app.get("/api/messages", (req, res) => {
  res.json(messages);
});
// save the image from the canvas
app.post('/save-image', (req, res) => {
  let dataUrl = req.body.dataUrl;
  let base64Data = dataUrl.replace(/^data:image\/webp;base64,/, "");

  // Delete all files in the screenshot directory
  fs.readdir(path.join(__dirname, 'static', 'images', 'screenshot'), (err, files) => {
    if (err) {
      console.log(err);
    } else {
      for (const file of files) {
        fs.unlink(path.join(__dirname, 'static', 'images', 'screenshot', file), (err) => {
          if (err) {
            console.log(err);
          }
        });
      }
    }
  });
  
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
  io.emit("messages", messages);
  socket.on("hi", () => {
    fs.appendFileSync("log.txt", `${printMyDate()}\n${socket.id} HAS CONNECTED\n\n`)
    console.log("##### HI #####");
  });
  socket.on("clientCam", (cam) => {
    console.log("CAM:", cam);
    // Store the cam message for new clients
    // Check if the cam message is already in the messages array
    // If it is, update the cam message
    // If it is not, add the cam message
    let camIndex = messages.findIndex(item => item.cam);
    if (camIndex !== -1) {
      messages[camIndex].cam = cam;
    } else {
      messages.push({cam: cam});
    }
    console.log(messages);
    io.emit("camBack", cam);
  });
  socket.on("clientMessage", (msg) => {
    console.log("MESSAGE:", msg);
    fs.appendFileSync("log.txt", `Message: ${msg}\n`)
    // Store the message for new clients
    // Check if the message is already in the messages array
    // If it is, update the message
    // If it is not, add the message
    let msgIndex = messages.findIndex(item => item.msg);
    if (msgIndex !== -1) {
      messages[msgIndex].msg = msg;
    } else {
      messages.push({msg: msg});
    }
    console.log(messages);
    io.emit("messageBack", msg);
  });
  socket.on("clientReset", () => {
    console.log("RESET");
    // Reset the messages array
    // remove object {cam: cam} and {msg: msg}
    messages = messages.filter(item => !item.cam && !item.msg);
    console.log(messages);
    // Send a reset message to all clients
    io.emit("camBack", "reset");
    io.emit("messageBack", "reset");
  });
});


// ATEM Mini streaming status and input changes (Tally status)
myAtem.on('stateChanged', (state, pathToChange) => {
  console.log('State changed:', pathToChange);
  //console.log('State:', state);
  //console.log(`previewInput: ${state.video.mixEffects[0].previewInput}`);
  //console.log(`programInput: ${state.video.mixEffects[0].programInput}`);
  if (pathToChange.includes('streaming.status')) {
    console.log(`Streaming state: ${state.streaming.status.state}`);
    // Store the message for new clients
    // Check if the streaming status message is already in the messages array
    // If it is, update the streaming status message
    // If it is not, add the streaming status message
    let streamingIndex = messages.findIndex(item => item.streamingStatus);
    if (streamingIndex !== -1) {
      messages[streamingIndex].streamingStatus = state.streaming.status.state;
    } else {
      messages.push({streamingStatus: state.streaming.status.state});
    }
    console.log(messages);
    // Send the streaming status to all clients
    io.emit("streamingStatusChanged", { streamingStatus: state.streaming.status.state });
    //io.emit("streamingStatusChanged", "STREAMING");
  }
  if (pathToChange.includes('video.mixEffects.0.previewInput') || pathToChange.includes('video.mixEffects.0.programInput')) {
    console.log(`Preview input: ${state.video.mixEffects[0].previewInput}`);
    console.log(`Program input: ${state.video.mixEffects[0].programInput}`);
    // Store the message for new clients
    // Check if the input message is already in the messages array
    // If it is, update the input message
    // If it is not, add the input message
    let inputIndex = messages.findIndex(item => item.previewInput && item.programInput);
    if (inputIndex !== -1) {
      messages[inputIndex].previewInput = state.video.mixEffects[0].previewInput;
      messages[inputIndex].programInput = state.video.mixEffects[0].programInput;
    } else {
      messages.push({previewInput: state.video.mixEffects[0].previewInput, programInput: state.video.mixEffects[0].programInput});
    }
    console.log(messages);
    // Send the preview and program inputs to all clients
    io.emit("InputChanged", { changedInputs: { previewInput: state.video.mixEffects[0].previewInput, programInput: state.video.mixEffects[0].programInput } });
  }
});


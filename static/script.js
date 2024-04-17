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

// Canvas image display to clients
socket.on('imageSaved', function(data) {
  console.log('Image saved:', data.imagePath);
  document.querySelector("#message-display").style.backgroundImage = `url(${data.imagePath})`;
  document.querySelector("#message-display").innerHTML = "";
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


const dialog = document.querySelector('dialog');
const openDialogButton = document.querySelector('#open-dialog');
const closeDialogButton = document.querySelector('#close-dialog');
openDialogButton.addEventListener('click', () => {
    dialog.showModal();
});
closeDialogButton.addEventListener('click', () => {
    dialog.close();
});

// save the image from the canvas
let saveCanvasButton = document.getElementById('save-canvas');

saveCanvasButton.addEventListener('click', function() {
    let dataUrl = canvas.toDataURL('image/webp');

    fetch('/save-image', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ dataUrl: dataUrl })
    })
    .then(response => response.text())
    .then(data => console.log(data))
    .then(() => { dialog.close(); })
    .catch((error) => {
        console.error('Error:', error);
    });
});





// Canvas pam amd zoom from https://codepen.io/chengarda/pen/wRxoyB
let canvas = document.getElementById("canvas")
let ctx = canvas.getContext('2d')

let cameraOffset = { x: window.innerWidth/2, y: window.innerHeight/2 }
let cameraZoom = 1
let MAX_ZOOM = 5
let MIN_ZOOM = 0.1
let SCROLL_SENSITIVITY = 0.0005

let image = new Image();
image.src = '/static/images/screenshot.webp';

function draw() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  // Translate to the canvas centre before zooming - so you'll always zoom on what you're looking directly at
  ctx.translate(window.innerWidth / 2, window.innerHeight / 2);
  ctx.scale(cameraZoom, cameraZoom);
  ctx.translate(-window.innerWidth / 2 + cameraOffset.x, -window.innerHeight / 2 + cameraOffset.y);
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  // Calculate the x and y coordinates to draw the image at
  let x = (window.innerWidth - image.width * cameraZoom) / 2;
  let y = (window.innerHeight - image.height * cameraZoom) / 2;

  // Draw the image onto the canvas
  ctx.drawImage(image, x, y, image.width * cameraZoom, image.height * cameraZoom);

  requestAnimationFrame(draw);
}

// Gets the relevant location from a mouse or single touch event
function getEventLocation(e)
{
    if (e.touches && e.touches.length == 1)
    {
        return { x:e.touches[0].clientX, y: e.touches[0].clientY }
    }
    else if (e.clientX && e.clientY)
    {
        return { x: e.clientX, y: e.clientY }        
    }
}

function drawRect(x, y, width, height)
{
    ctx.fillRect( x, y, width, height )
}

function drawText(text, x, y, size, font)
{
    ctx.font = `${size}px ${font}`
    ctx.fillText(text, x, y)
}

let isDragging = false
let dragStart = { x: 0, y: 0 }

function onPointerDown(e)
{
    isDragging = true
    dragStart.x = getEventLocation(e).x/cameraZoom - cameraOffset.x
    dragStart.y = getEventLocation(e).y/cameraZoom - cameraOffset.y
}

function onPointerUp(e)
{
    isDragging = false
    initialPinchDistance = null
    lastZoom = cameraZoom
}

function onPointerMove(e)
{
    if (isDragging)
    {
        cameraOffset.x = getEventLocation(e).x/cameraZoom - dragStart.x
        cameraOffset.y = getEventLocation(e).y/cameraZoom - dragStart.y
    }
}

function handleTouch(e, singleTouchHandler)
{
    if ( e.touches.length == 1 )
    {
        singleTouchHandler(e)
    }
    else if (e.type == "touchmove" && e.touches.length == 2)
    {
        isDragging = false
        handlePinch(e)
    }
}

let initialPinchDistance = null
let lastZoom = cameraZoom

function handlePinch(e)
{
    e.preventDefault()
    
    let touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    let touch2 = { x: e.touches[1].clientX, y: e.touches[1].clientY }
    
    // This is distance squared, but no need for an expensive sqrt as it's only used in ratio
    let currentDistance = (touch1.x - touch2.x)**2 + (touch1.y - touch2.y)**2
    
    if (initialPinchDistance == null)
    {
        initialPinchDistance = currentDistance
    }
    else
    {
        adjustZoom( null, currentDistance/initialPinchDistance )
    }
}

function adjustZoom(zoomAmount, zoomFactor)
{
    if (!isDragging)
    {
        if (zoomAmount)
        {
            cameraZoom += zoomAmount
        }
        else if (zoomFactor)
        {
            console.log(zoomFactor)
            cameraZoom = zoomFactor*lastZoom
        }
        
        cameraZoom = Math.min( cameraZoom, MAX_ZOOM )
        cameraZoom = Math.max( cameraZoom, MIN_ZOOM )
        
        console.log(zoomAmount)
    }
}

canvas.addEventListener('mousedown', onPointerDown)
canvas.addEventListener('touchstart', (e) => handleTouch(e, onPointerDown))
canvas.addEventListener('mouseup', onPointerUp)
canvas.addEventListener('touchend',  (e) => handleTouch(e, onPointerUp))
canvas.addEventListener('mousemove', onPointerMove)
canvas.addEventListener('touchmove', (e) => handleTouch(e, onPointerMove))
canvas.addEventListener( 'wheel', (e) => adjustZoom(e.deltaY*SCROLL_SENSITIVITY))

// Ready, set, go
draw()



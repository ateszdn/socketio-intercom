const { Atem } = require('atem-connection')
const bonjour = require('bonjour')()

const myAtem = new Atem()

let atemIp;
let atemIps;

// browse for all ATEM Mini services
const searchOptions = {
  type: "blackmagic",
  txt: {
    'class': "AtemSwitcher"
  }
}

/* const searchAtemDevices = async function () {
  let browser = bonjour.find(searchOptions, function (service) {
    console.log(`Found an ATEM Mini: ${service.addresses} - ${service.name}`)
    atemIps = service;
    atemIp = service.addresses[0]; // Store the IP address of the ATEM Mini
  })
  //browser.start()
  await new Promise(resolve => setTimeout(resolve, 5000));
  //setTimeout(() => {
    console.log("Browser stops");
    browser.stop();
    console.log('ATEM Mini IP:', atemIp);
  //}, "5000");

  console.log(`Let's connect to the device on ${atemIp}`)
  myAtem.connect(atemIp);
  //myAtem.connect('192.168.0.106') // replace with your ATEM IP address
  //myAtem.connect('192.168.8.100') // replace with your ATEM IP address

  myAtem.on('info', console.log)
  myAtem.on('error', console.error)
} */

const searchAtemDevices = function () {
  let browser = bonjour.find(searchOptions);

  // Listen for the 'up' event which is emitted when a service is discovered
  browser.on('up', function (service) {
    console.log(`Found an ATEM Mini: ${service.addresses} - ${service.name}`)
    atemIp = service.addresses[0]; // Store the IP address of the ATEM Mini
    //console.log('ATEM Mini IP:', atemIp);

    // Connect to the ATEM Mini immediately after finding it
    console.log(`Connect to the device on ${atemIp}`)
    myAtem.connect(atemIp);

    // Stop the browser after finding the service to prevent further searches
    browser.stop();

    // Set up listeners for info and error events
    myAtem.on('info', console.log);
    myAtem.on('error', console.error);
  });
}

searchAtemDevices();

myAtem.on('connected', () => {
  console.log('Connected to ATEM')
  console.log("  Device's streaming state: ", myAtem.state.streaming.status) // This will log the streaming state
  console.log("  Device's recording state: ", myAtem.state.recording.status) // This will log the recording state
  //console.log(`AUX1:\n${myAtem.state.fairlight.inputs[1301].sources}`)
  //console.log(`MASTER:\n${myAtem.state.fairlight.master}`)
  //console.log(myAtem.state.fairlight.inputs[1301].sources[-65280].dynamics)
  //console.log(myAtem.state.media.players)
  //console.log(myAtem.state.settings)
  //console.log(myAtem.state.settings.multiViewers[0].windows)
})

// https://nrkno.github.io/sofie-atem-connection/enums/Enums.RecordingStatus.html
// https://nrkno.github.io/sofie-atem-connection/enums/Enums.StreamingStatus.html
/***************************************************/
/*  ATEM Mini myAtem.state.streaming.status CODES  */
/*  { state: 2, error: 0 } STARTING                */
/*  { state: 4, error: 0 } STREAMING               */
/*  { state: 32, error: 0 } STOPPUNG               */
/*  { state: 1, error: 0 } NOT STREAMING           */
/***************************************************/
/* myAtem.on('stateChanged', (state, pathToChange) => {
  if (pathToChange.includes('streaming.status')) {
    console.log(`Streaming state: ${state.streaming.status.state}`);
    io.emit('streamingStatusChanged', { streamingStatus: state.streaming.status.state });
  }
});
*/

module.exports = myAtem;
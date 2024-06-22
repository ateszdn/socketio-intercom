const { Atem } = require('atem-connection')
const bonjour = require('bonjour')()

let atemIp;

// browse for all ATEM Mini services
bonjour.find({ type: 'atem-mini' }, function (service) {
  console.log('Found an ATEM Mini:', service)
  atemIp = service.addresses[0]; // Store the IP address of the ATEM Mini
})
console.log('ATEM Mini IP:', atemIp);

const myAtem = new Atem()
myAtem.connect('192.168.0.105') // replace with your ATEM IP address
//myAtem.connect('192.168.8.100') // replace with your ATEM IP address

myAtem.on('info', console.log)
myAtem.on('error', console.error)

myAtem.on('connected', () => {
  console.log('Connected to ATEM')
  console.log(myAtem.state.streaming.status) // This will log the streaming state
})

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
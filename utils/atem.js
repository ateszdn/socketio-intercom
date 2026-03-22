const { Atem } = require("atem-connection");
const bonjour = require("bonjour")();

const myAtem = new Atem();

// Browse for ATEM Mini services via Bonjour/mDNS
const searchOptions = {
  type: "blackmagic",
  txt: {
    class: "AtemSwitcher",
  },
};

function searchAtemDevices() {
  const browser = bonjour.find(searchOptions);

  browser.on("up", (service) => {
    const atemIp = service.addresses[0];
    console.log(`Found ATEM Mini: ${service.addresses} - ${service.name}`);
    console.log(`Connecting to ${atemIp}`);

    myAtem.connect(atemIp);
    browser.stop();

    myAtem.on("info", console.log);
    myAtem.on("error", console.error);
  });
}

searchAtemDevices();

myAtem.on("connected", () => {
  console.log("Connected to ATEM");
  console.log("  Streaming state:", myAtem.state.streaming.status);
  console.log("  Recording state:", myAtem.state.recording.status);
});

// Streaming status codes:
// 1 = NOT_STREAMING, 2 = STARTING, 4 = STREAMING, 32 = STOPPING
// https://nrkno.github.io/sofie-atem-connection/enums/Enums.StreamingStatus.html
// https://nrkno.github.io/sofie-atem-connection/enums/Enums.RecordingStatus.html

module.exports = myAtem;

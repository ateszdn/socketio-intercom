// This script gets the IP addresses the machine uses to connect to the local network
const os = require("os");

// Get network interface information
let ifaces;
try {
  ifaces = os.networkInterfaces();
} catch (error) {
  console.error("Failed to get network interface information:", error);
  process.exit(1);
}

let ips = [];  // Store all external IPv4 addresses here

// Iterate over each network interface
Object.keys(ifaces).forEach((ifname) => {
  let addressCount = 0;  // Count of non-internal IPv4 addresses for this interface

  // Iterate over each address for this interface
  ifaces[ifname].forEach((iface) => {
    // Skip non-IPv4 addresses, internal addresses, and interfaces with '*' in their name
    if ('IPv4' !== iface.family || iface.internal !== false || ifname.indexOf('*') > 0) {
      return;
    }

    addressCount++;

    // Log the address and interface name
    // If this interface has multiple addresses, append the count to the interface name
    console.log(ifname + (addressCount > 1 ? ":" + addressCount : ""), iface.address);

    // Add the address to the ips array
    ips.push(iface.address);
  });
});

console.log("IPs:", ips);

// Export the array of IP addresses
module.exports = ips;
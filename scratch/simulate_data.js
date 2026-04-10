/**
 * Simulation Script for Issue #19
 * Sends raw UDP packets to ports configured in CIKO
 */

const udp = require('dgram');

const dataSources = [
    { name: 'DVOR Sentani (TX 1)', port: 4001, data: '\x01\x02N1S1=120|S2=300|S3=450|S4=150\x03\x01\x02G1S11=50|S12=150|S13=480|S20=1\x03' },
    { name: 'Localizer (Source)', port: 5001, data: '\x01\x02N1S1=110|S2=310|S3=440|S4=160\x03\x01\x02G1S11=49|S12=149|S13=479|S20=1\x03' }
];

const FREQUENCY_MS = 60000; // 1 minute

async function runSimulation() {
    console.log(`[${new Date().toLocaleTimeString()}] --- Starting Simulation Cycle ---`);
    
    for (const source of dataSources) {
        const client = udp.createSocket('udp4');
        const message = Buffer.from(source.data, 'binary');
        
        client.send(message, source.port, 'localhost', (err) => {
            if (err) {
                console.error(`Error sending to ${source.name}:`, err.message);
            } else {
                console.log(`Successfully sent ${message.length} bytes to ${source.name} (Port ${source.port})`);
            }
            client.close();
        });
        
        // Wait a bit between sends
        await new Promise(resolve => setTimeout(resolve, 200));
    }
}

console.log(`🚀 Continuous Simulation started (Every ${FREQUENCY_MS/1000}s)`);
console.log('Press Ctrl+C to stop.\n');

// Initial run
runSimulation();
// Periodic runs
setInterval(runSimulation, FREQUENCY_MS);

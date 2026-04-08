
const sniffer = require('./src/network/sniffer');

async function testSniffer() {
    console.log('--- Testing Packet Sniffer (Real Priority) ---');
    
    // Attempt to start on 'lo0' (local loopback) which might not require sudo on some systems
    // but usually still does.
    console.log('Starting sniffer on lo0...');
    await sniffer.start('lo0');
    
    // Wait 6 seconds to see if it falls back to simulated
    console.log('Waiting 6 seconds for data/fallback check...');
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    const stats = sniffer.getStatistics();
    console.log('\n--- Statistics ---');
    console.log(`Capture Mode: ${stats.captureMode}`);
    console.log(`Total Packets: ${stats.totalPackets}`);
    console.log(`Is Capturing: ${stats.isCapturing}`);
    console.log(`Last Error: ${stats.lastError}`);
    
    console.log('\nStopping sniffer...');
    sniffer.stop();
    console.log('Done.');
}

testSniffer().catch(console.error);

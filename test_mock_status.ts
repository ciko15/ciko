
const { fetchAndParseData } = require('./src/utils/network');
const db = require('./db/database');
const network = require('./src/utils/network');

// Mock pingHost to control results
const originalPing = network.pingHost;

async function runMocks() {
    console.log('--- Mocking Multi-Source Status Logic ---');
    
    // Scenario 1: All sources alive -> Normal
    network.pingHost = async () => ({ alive: true });
    let res = await fetchAndParseData({ id: "1775111531489" });
    console.log(`Test 1 (All Alive): Result Status = ${res.status} (Expected: Normal)`);
    
    // Scenario 2: Some sources alive -> Warning
    let callCount = 0;
    network.pingHost = async () => {
        callCount++;
        return { alive: callCount % 2 === 0 }; // Alternate alive/dead
    };
    res = await fetchAndParseData({ id: "1775111531489" });
    console.log(`Test 2 (Partial Alive): Result Status = ${res.status} (Expected: Warning)`);
    console.log(`Sources:`, res.parsedData._sources.map((s: any) => `${s.name}: ${s.alive}`));

    // Scenario 3: All sources dead -> Disconnect
    network.pingHost = async () => ({ alive: false });
    res = await fetchAndParseData({ id: "1775111531489" });
    console.log(`Test 3 (All Dead): Result Status = ${res.status} (Expected: Disconnect)`);

    // Restore
    network.pingHost = originalPing;
}

runMocks().catch(console.error);

export {};

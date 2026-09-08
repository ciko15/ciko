const fs = require('fs');
const dbPath = './db/equipment_config.json';
if (!fs.existsSync(dbPath)) {
    console.log("No equipment_config.json");
    process.exit(1);
}
const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
for (const eq of data) {
    if (eq.name === 'SDP-A' || eq.name === 'RADAR' || eq.name === 'ASMGCS' || eq.name === 'DME') {
        console.log(`Equipment: ${eq.name}`);
        console.log(`  Overall Status: ${eq.status}`);
        if (eq.lastData) {
            for (const [srcName, srcData] of Object.entries(eq.lastData)) {
                console.log(`  Source: ${srcName}`);
                console.log(`    _status: ${srcData._status}`);
            }
        }
    }
}

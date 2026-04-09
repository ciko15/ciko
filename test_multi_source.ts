
const db = require('./db/database');
const { fetchAndParseData } = require('./src/utils/network');

async function test() {
    console.log('--- Testing Multi-Source Monitoring ---');
    
    // Use an equipment ID from equipment_otentication_config.json
    // Example: 1775111531489 has 3 sources: Primary (from equipment_config), TX 1, TX 2, RX 1
    const equipmentId = "1775111531489";
    const equipment = await db.getEquipmentById(equipmentId);
    
    if (!equipment) {
        console.error('Equipment not found');
        return;
    }

    console.log(`Equipment: ${equipment.name} (ID: ${equipment.id})`);
    console.log('Running fetchAndParseData...');
    
    const result = await fetchAndParseData(equipment);
    
    console.log('\n--- Result ---');
    console.log(`Overall Status: ${result.status}`);
    console.log(`Sources Checked:`);
    result.parsedData._sources.forEach((s: any) => {
        console.log(` - ${s.name} (${s.ip}): ${s.alive ? 'ALIVE' : 'DOWN'}`);
    });
    console.log('---------------');
}

test().catch(console.error);

/**
 * Demo Scheduler for Auto-Save Equipment Logs
 * Uji coba auto-save dengan data testing yang sudah terhubung
 */

const cron = require('node-cron');
const { Pool } = require('pg');
const dbConfig = require('./db/config');

// Database connection
const pool = new Pool(dbConfig);

// Status simulation for demo (rotates through statuses)
const statusRotation = ['Normal', 'Normal', 'Normal', 'Warning', 'Normal', 'Normal', 'Alert', 'Normal', 'Disconnect', 'Normal'];

/**
 * Generate simulated equipment data based on connection method
 */
function generateEquipmentData(equipment) {
  const snmpConfig = equipment.snmp_config || {};
  const method = snmpConfig.method || 'snmp';
  
  // Base data structure
  const baseData = {
    timestamp: new Date().toISOString(),
    status: equipment.status,
    method: method,
    equipment_name: equipment.name,
    equipment_code: equipment.code
  };

  // Generate method-specific data
  switch (method) {
    case 'snmp':
      return {
        ...baseData,
        deviceName: equipment.name,
        uptime: Math.floor(Math.random() * 86400), // 0-24 hours in seconds
        temperature: 20 + Math.floor(Math.random() * 30), // 20-50°C
        humidity: 40 + Math.floor(Math.random() * 40), // 40-80%
        powerStatus: Math.random() > 0.1 ? 1 : 0, // 90% normal
        batteryStatus: 80 + Math.floor(Math.random() * 20), // 80-100%
        digitalInputs: [1, 0, 1, 0],
        analogInputs: [220 + Math.floor(Math.random() * 10), 24 + Math.floor(Math.random() * 2)]
      };
      
    case 'json':
      return {
        ...baseData,
        apiResponse: 'success',
        responseTime: 50 + Math.floor(Math.random() * 200), // 50-250ms
        dataPoints: {
          voltage: 220 + Math.floor(Math.random() * 10),
          current: 5 + Math.floor(Math.random() * 5),
          frequency: 50 + (Math.random() * 0.5)
        }
      };
      
    case 'mqtt':
      return {
        ...baseData,
        topic: `sensors/${equipment.code.toLowerCase()}`,
        qos: 1,
        messageCount: Math.floor(Math.random() * 1000),
        lastMessage: new Date().toISOString(),
        sensorData: {
          temperature: 25 + Math.floor(Math.random() * 10),
          pressure: 1013 + Math.floor(Math.random() * 20)
        }
      };
      
    case 'modbus':
      return {
        ...baseData,
        registerMap: {
          holdingRegister1: 1000 + Math.floor(Math.random() * 100),
          inputRegister1: 500 + Math.floor(Math.random() * 50),
          coilStatus: [1, 1, 0, 1]
        },
        unitId: snmpConfig.unitId || 1
      };
      
    default:
      return baseData;
  }
}

/**
 * Simulate status change based on random factors
 */
function simulateStatusChange(currentStatus) {
  const rand = Math.random();
  
  // 80% chance keep current status
  if (rand < 0.8) return currentStatus;
  
  // 20% chance change status
  const statuses = ['Normal', 'Warning', 'Alert', 'Disconnect'];
  const weights = [0.6, 0.2, 0.1, 0.1]; // Higher chance for Normal
  
  let cumulative = 0;
  const target = Math.random();
  
  for (let i = 0; i < statuses.length; i++) {
    cumulative += weights[i];
    if (target <= cumulative) return statuses[i];
  }
  
  return 'Normal';
}

/**
 * Save equipment log to database with 6 columns:
 * 1. ID (auto-generated)
 * 2. Nama Alat (equipment_name)
 * 3. Status (status)
 * 4. Keterangan/Parameter (data)
 * 5. Waktu Update (logged_at)
 * 6. Bandara (airport_name)
 */
async function saveEquipmentLog(equipment, data, source) {
  try {
    const query = `
      INSERT INTO equipment_logs 
        (equipment_id, equipment_name, status, data, source, logged_at, airport_name, airport_city)
      VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)
      RETURNING id
    `;
    
    const status = data.status || equipment.status || 'Normal';
    const airportName = equipment.airport_name || equipment.airportName || 'Unknown';
    const airportCity = equipment.airport_city || equipment.airportCity || '';
    
    const values = [
      equipment.id,
      equipment.name,
      status,
      JSON.stringify(data),
      source,
      airportName,
      airportCity
    ];
    
    const result = await pool.query(query, values);
    console.log(`[${new Date().toISOString()}] Log saved for ${equipment.name} at ${airportName} (ID: ${result.rows[0].id}, Status: ${status})`);
    return result.rows[0].id;
  } catch (error) {
    console.error(`Error saving log for ${equipment.name}:`, error);
    return null;
  }
}

/**
 * Update equipment status in database
 */
async function updateEquipmentStatus(equipmentId, newStatus) {
  try {
    const query = `
      UPDATE equipment 
      SET status = $1, updated_at = NOW()
      WHERE id = $2
    `;
    
    await pool.query(query, [newStatus, equipmentId]);
    console.log(`[${new Date().toISOString()}] Status updated for equipment ID ${equipmentId}: ${newStatus}`);
  } catch (error) {
    console.error(`Error updating status for equipment ${equipmentId}:`, error);
  }
}

/**
 * Get all active equipment from database
 */
async function getActiveEquipment() {
  try {
    const query = `
      SELECT e.*, a.name as airport_name, a.city as airport_city
      FROM equipment e
      LEFT JOIN airports a ON e.airport_id = a.id
      WHERE e.snmp_config IS NOT NULL
      ORDER BY e.id
    `;
    
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('Error fetching equipment:', error);
    return [];
  }
}

/**
 * Main scheduler task - runs every minute
 */
async function runAutoSave() {
  console.log('\n========================================');
  console.log(`[${new Date().toISOString()}] Starting auto-save cycle...`);
  console.log('========================================\n');
  
  try {
    // 1. Get all active equipment
    const equipment = await getActiveEquipment();
    console.log(`Found ${equipment.length} equipment to monitor\n`);
    
    // 2. Process each equipment
    for (const item of equipment) {
      console.log(`Processing: ${item.name} (${item.code}) at ${item.airport_name}`);
      
      // Generate simulated data
      const data = generateEquipmentData(item);
      
      // Simulate status change
      const newStatus = simulateStatusChange(item.status);
      data.status = newStatus;
      
      // Determine source based on snmp_config
      const snmpConfig = item.snmp_config || {};
      const source = snmpConfig.method || 'snmp';
      
      // Save log
      const logId = await saveEquipmentLog(item, data, source);
      
      // Update status if changed
      if (newStatus !== item.status) {
        await updateEquipmentStatus(item.id, newStatus);
        console.log(`  ⚠️  Status changed: ${item.status} → ${newStatus}`);
      } else {
        console.log(`  ✓ Status unchanged: ${newStatus}`);
      }
      
      console.log(`  ✓ Log saved (ID: ${logId})\n`);
      
      // Small delay between equipment to avoid overwhelming
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('========================================');
    console.log(`[${new Date().toISOString()}] Auto-save cycle completed`);
    console.log(`Processed ${equipment.length} equipment`);
    console.log('========================================\n');
    
  } catch (error) {
    console.error('Error in auto-save cycle:', error);
  }
}

/**
 * Get statistics from logs
 */
async function getLogStatistics() {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_logs,
        COUNT(DISTINCT equipment_id) as unique_equipment,
        MAX(logged_at) as last_log,
        MIN(logged_at) as first_log
      FROM equipment_logs
      WHERE logged_at > NOW() - INTERVAL '24 hours'
    `;
    
    const result = await pool.query(statsQuery);
    return result.rows[0];
  } catch (error) {
    console.error('Error getting statistics:', error);
    return null;
  }
}

/**
 * Display current statistics
 */
async function displayStatistics() {
  const stats = await getLogStatistics();
  if (stats) {
    console.log('\n📊 24-Hour Statistics:');
    console.log(`   Total Logs: ${stats.total_logs}`);
    console.log(`   Unique Equipment: ${stats.unique_equipment}`);
    console.log(`   First Log: ${stats.first_log}`);
    console.log(`   Last Log: ${stats.last_log}`);
    console.log('');
  }
}

// ============================================
// DEMO MODE - Run immediately and then every minute
// ============================================

console.log('🚀 Equipment Auto-Save Scheduler (DEMO MODE)');
console.log('==============================================\n');

// Run immediately for testing
console.log('Running initial test cycle...\n');
runAutoSave().then(() => {
  displayStatistics();
});

// Then schedule to run every minute
console.log('Scheduling to run every minute...\n');

// For demo: run every 30 seconds instead of 1 minute
const task = cron.schedule('*/30 * * * * *', async () => {
  await runAutoSave();
  await displayStatistics();
});

console.log('✅ Scheduler started!');
console.log('   - Running every 30 seconds (demo mode)');
console.log('   - Press Ctrl+C to stop\n');

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down scheduler...');
  task.stop();
  await pool.end();
  console.log('✅ Scheduler stopped. Goodbye!');
  process.exit(0);
});

module.exports = {
  runAutoSave,
  getLogStatistics,
  saveEquipmentLog
};

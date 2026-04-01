/**
 * Connection Tester Scheduler
 * Automatically tests equipment connections
 * TOC Project
 */

const net = require('net');
const dns = require('dns').promises;
const { getIO } = require('../websocket/server');
const db = require('../../db/database');

// Test configuration
const TEST_CONFIG = {
  timeout: 5000,        // Connection timeout (ms)
  retryCount: 2,        // Number of retries on failure
  retryDelay: 2000,     // Delay between retries (ms)
  concurrent: 5         // Max concurrent tests
};

// Queue for equipment to test
let testQueue = [];
let isRunning = false;
let intervalId = null;

/**
 * Initialize the connection tester scheduler
 */
function initializeConnectionTester() {
  console.log('[CONN_TEST] Connection tester scheduler initialized');
  
  // Run test every 60 seconds
  intervalId = setInterval(() => {
    runConnectionTests();
  }, 60000);
  
  // Run initial test after 10 seconds
  setTimeout(() => {
    runConnectionTests();
  }, 10000);
  
  return {
    start: () => {
      if (!intervalId) {
        intervalId = setInterval(runConnectionTests, 60000);
      }
    },
    stop: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
    testNow: runConnectionTests
  };
}

/**
 * Run connection tests for all enabled equipment
 */
async function runConnectionTests() {
  if (isRunning) {
    console.log('[CONN_TEST] Test already running, skipping...');
    return;
  }
  
  isRunning = true;
  console.log('[CONN_TEST] Starting connection tests...');
  
  try {
    // Get all equipment with connection config
    const equipment = await getEquipmentForTesting();
    console.log(`[CONN_TEST] Testing ${equipment.length} equipment`);
    
    // Process in batches
    for (let i = 0; i < equipment.length; i += TEST_CONFIG.concurrent) {
      const batch = equipment.slice(i, i + TEST_CONFIG.concurrent);
      await Promise.all(batch.map(eq => testEquipmentConnection(eq)));
    }
    
    // Emit updated stats
    await emitConnectionStats();
    
  } catch (error) {
    console.error('[CONN_TEST] Error running connection tests:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * Get equipment with connection configuration
 */
async function getEquipmentForTesting() {
  const query = `
    SELECT e.id, e.name, e.code, e.category, ec.* 
    FROM equipment e
    LEFT JOIN equipment_connect ec ON e.id = ec.equipment_id
    WHERE e.is_active = TRUE 
    AND ec.is_enabled = TRUE
    AND ec.host IS NOT NULL
    AND ec.host != ''
  `;
  
  return await db.query(query);
}

/**
 * Test connection to a single equipment
 */
async function testEquipmentConnection(equipment) {
  const { id, name, code, host, port, connection_type, protocol } = equipment;
  
  console.log(`[CONN_TEST] Testing ${name} (${host}:${port})...`);
  
  const result = {
    equipmentId: id,
    equipmentName: name,
    equipmentCode: code,
    success: false,
    responseTime: null,
    error: null,
    timestamp: new Date().toISOString()
  };
  
  try {
    // Test based on connection type
    if (connection_type === 'rcms' || protocol === 'tcp') {
      await testTCPConnection(host, port);
    } else if (connection_type === 'snmp') {
      await testUDPConnection(host, port || 161);
    } else {
      // Default to TCP
      await testTCPConnection(host, port || 950);
    }
    
    result.success = true;
    console.log(`[CONN_TEST] ${name}: Connected`);
    
  } catch (error) {
    result.success = false;
    result.error = error.message;
    console.log(`[CONN_TEST] ${name}: Failed - ${error.message}`);
  }
  
  // Save result to database
  await saveConnectionResult(equipment, result);
  
  // Update equipment status
  await updateEquipmentStatus(id, result.success);
  
  // Emit via WebSocket
  emitConnectionResult(result);
  
  return result;
}

/**
 * Test TCP connection
 */
function testTCPConnection(host, port) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    
    socket.setTimeout(TEST_CONFIG.timeout);
    
    socket.on('connect', () => {
      const responseTime = Date.now() - startTime;
      socket.destroy();
      resolve({ success: true, responseTime });
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Connection timeout'));
    });
    
    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });
    
    socket.connect(port, host);
  });
}

/**
 * Test UDP connection (for SNMP)
 */
async function testUDPConnection(host, port) {
  // For UDP, we just check if host is reachable
  // Actual SNMP test would require snmp library
  try {
    await dns.lookup(host);
    return { success: true, responseTime: null };
  } catch (error) {
    throw new Error(`DNS lookup failed: ${error.message}`);
  }
}

/**
 * Save connection test result to database
 */
async function saveConnectionResult(equipment, result) {
  const query = `
    INSERT INTO connection_logs 
    (equipment_id, connect_id, test_result, response_time, error_message)
    VALUES (?, ?, ?, ?, ?)
  `;
  
  await db.query(query, [
    equipment.id,
    equipment.id,
    result.success ? 'success' : 'failed',
    result.responseTime,
    result.error
  ]);
  
  // Update last connected timestamp
  if (result.success) {
    const updateQuery = `
      UPDATE equipment_connect 
      SET last_connected = NOW(), last_error = NULL
      WHERE equipment_id = ?
    `;
    await db.query(updateQuery, [equipment.id]);
  } else {
    const updateQuery = `
      UPDATE equipment_connect 
      SET last_error = ?
      WHERE equipment_id = ?
    `;
    await db.query(updateQuery, [result.error, equipment.id]);
  }
}

/**
 * Update equipment status based on connection result
 */
async function updateEquipmentStatus(equipmentId, isConnected) {
  const status = isConnected ? 'Normal' : 'Disconnect';
  
  // Check if status record exists
  const checkQuery = `SELECT id FROM equipment_status WHERE equipment_id = ?`;
  const existing = await db.query(checkQuery, [equipmentId]);
  
  if (existing.length > 0) {
    // Update existing
    const updateQuery = `
      UPDATE equipment_status 
      SET status = ?, 
          connection_status = ?,
          status_since = IF(? = 'Disconnect', NOW(), status_since),
          last_updated = NOW()
      WHERE equipment_id = ?
    `;
    await db.query(updateQuery, [status, isConnected ? 'Connected' : 'Disconnect', status, equipmentId]);
  } else {
    // Insert new
    const insertQuery = `
      INSERT INTO equipment_status 
      (equipment_id, status, connection_status, status_since)
      VALUES (?, ?, ?, NOW())
    `;
    await db.query(insertQuery, [equipmentId, status, isConnected ? 'Connected' : 'Disconnect']);
  }
  
  // Also update main equipment table
  const updateEquipmentQuery = `
    UPDATE equipment 
    SET status = ?, updated_at = NOW()
    WHERE id = ?
  `;
  await db.query(updateEquipmentQuery, [status, equipmentId]);
}

/**
 * Emit connection result via WebSocket
 */
function emitConnectionResult(result) {
  const io = getIO();
  if (io) {
    io.emit('equipment:connection:test', result);
  }
}

/**
 * Emit connection statistics
 */
async function emitConnectionStats() {
  const query = `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'Normal' THEN 1 ELSE 0 END) as connected,
      SUM(CASE WHEN status = 'Disconnect' THEN 1 ELSE 0 END) as disconnected
    FROM equipment 
    WHERE is_active = TRUE
  `;
  
  const stats = await db.query(query);
  
  const io = getIO();
  if (io && stats.length > 0) {
    io.emit('stats:connection', stats[0]);
  }
}

/**
 * Test single equipment on demand
 */
async function testEquipmentOnDemand(equipmentId) {
  const query = `
    SELECT e.id, e.name, e.code, e.category, ec.* 
    FROM equipment e
    LEFT JOIN equipment_connect ec ON e.id = ec.equipment_id
    WHERE e.id = ?
  `;
  
  const equipment = await db.query(query, [equipmentId]);
  
  if (equipment.length === 0) {
    throw new Error('Equipment not found');
  }
  
  return await testEquipmentConnection(equipment[0]);
}

module.exports = {
  initializeConnectionTester,
  runConnectionTests,
  testEquipmentOnDemand
};

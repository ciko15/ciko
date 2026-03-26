#!/usr/bin/env node

/**
 * Script untuk menjalankan scheduler demo
 * Usage: node run-scheduler-demo.js
 */

const scheduler = require('./scheduler-demo');

console.log('🔧 Equipment Auto-Save Demo');
console.log('============================\n');

// Check if node-cron is installed
try {
  require('node-cron');
  console.log('✅ node-cron is installed\n');
} catch (e) {
  console.log('❌ node-cron is not installed');
  console.log('   Installing...');
  const { execSync } = require('child_process');
  try {
    execSync('npm install node-cron', { stdio: 'inherit' });
    console.log('✅ node-cron installed successfully\n');
  } catch (installError) {
    console.error('❌ Failed to install node-cron:', installError.message);
    console.log('\nPlease install manually: npm install node-cron');
    process.exit(1);
  }
}

console.log('Starting scheduler...\n');
console.log('Features:');
console.log('  • Auto-save every 30 seconds (demo mode)');
console.log('  • Simulates data from SNMP/JSON/MQTT/Modbus');
console.log('  • Random status changes (Normal/Warning/Alert/Disconnect)');
console.log('  • Saves to equipment_logs table');
console.log('  • Shows statistics every cycle\n');

// The scheduler will start automatically when required
require('./scheduler-demo');

console.log('\n💡 Tips:');
console.log('   - Open another terminal to check database:');
console.log('   - psql -d your_database -c "SELECT * FROM equipment_logs ORDER BY logged_at DESC LIMIT 10;"');
console.log('   - Or use the API: GET /api/equipment/logs');

const db = require('./db/database');

async function testDatabase() {
  try {
    console.log('Testing database connection...');
    
    // Test 1: Check if we can query equipment_logs
    console.log('\n1. Testing equipment_logs table...');
    const logs = await db.getEquipmentLogs({ limit: 5 });
    console.log('✅ Equipment logs query successful');
    console.log('   Data count:', logs.data.length);
    console.log('   Pagination:', logs.pagination);
    
    // Test 2: Check if we can get all equipment
    console.log('\n2. Testing equipment table...');
    const equipment = await db.getAllEquipment({ limit: 5 });
    console.log('✅ Equipment query successful');
    console.log('   Data count:', equipment.data?.length || equipment.length);
    
    // Test 3: Check if we can get users
    console.log('\n3. Testing users table...');
    const users = await db.getAllUsers();
    console.log('✅ Users query successful');
    console.log('   User count:', users.length);
    
    console.log('\n✅ All database tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testDatabase();

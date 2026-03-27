const mysql = require('mysql2/promise');
const config = require('./db/config.js');

async function test() {
  try {
    const conn = await mysql.createConnection(config);
    console.log('Connected to database');

    // Check equipment table structure
    const [rows] = await conn.execute('DESCRIBE equipment');
    console.log('Equipment table columns:');
    rows.forEach(row => console.log('  -', row.Field, row.Type, row.Null === 'NO' ? 'NOT NULL' : 'NULL'));

    // Check if branch_id column exists and has data
    const [equipment] = await conn.execute('SELECT id, name, ip_address, branch_id FROM equipment LIMIT 5');
    console.log('\nSample equipment data:');
    equipment.forEach(eq => console.log('  -', eq.id, eq.name, eq.ip_address, 'branch_id:', eq.branch_id));

    // Check users table
    const [users] = await conn.execute('SELECT id, username, role, branch_id FROM users LIMIT 5');
    console.log('\nSample users data:');
    users.forEach(user => console.log('  -', user.id, user.username, user.role, 'branch_id:', user.branch_id));

    await conn.end();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
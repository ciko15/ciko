const mysql = require('mysql2/promise');
const config = require('./db/config.js');

async function debugQuery() {
  try {
    const conn = await mysql.createConnection(config);
    console.log('Connected to database');

    // Test simple query
    const [rows] = await conn.execute('SELECT COUNT(*) as total FROM equipment');
    console.log('Total equipment:', rows[0].total);

    // Test branch filtering query
    const [branchRows] = await conn.execute('SELECT COUNT(*) as total FROM equipment WHERE branch_id = 1 OR (branch_id IS NULL AND airport_id = 1)');
    console.log('Equipment for branch 1:', branchRows[0].total);

    // Test the actual query from getAllEquipment
    const query = `
      SELECT e.*, a.name as airport_name, b.name as branch_name
      FROM equipment e
      LEFT JOIN airports a ON e.airport_id = a.id
      LEFT JOIN airports b ON e.branch_id = b.id
      WHERE 1=1 AND (e.branch_id = ? OR (e.branch_id IS NULL AND e.airport_id = ?))
      ORDER BY e.id LIMIT ? OFFSET ?
    `;
    const [result] = await conn.execute(query, [1, 1, 100, 0]);
    console.log('Query result length:', result.length);

    if (result.length > 0) {
      console.log('Sample result:', result[0]);
    }

    await conn.end();
  } catch (err) {
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
  }
}

debugQuery();
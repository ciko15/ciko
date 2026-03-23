const mysql = require('mysql2/promise');
const config = require('./config');

async function runMigration() {
  let connection;

  try {
    console.log('[MIGRATION] Starting branch_id migration...');

    connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      socketPath: config.socketPath
    });

    console.log('[MIGRATION] Connected to database');

    // Add branch_id column to equipment table
    await connection.execute(`
      ALTER TABLE equipment ADD COLUMN IF NOT EXISTS branch_id INT NULL
    `);
    console.log('[MIGRATION] Added branch_id column to equipment table');

    // Create index
    await connection.execute(`
      CREATE INDEX IF NOT EXISTS idx_equipment_branch ON equipment(branch_id)
    `);
    console.log('[MIGRATION] Created index on branch_id');

    // Backfill existing records
    await connection.execute(`
      UPDATE equipment
      SET branch_id = airport_id
      WHERE (branch_id IS NULL OR branch_id = 0) AND airport_id IS NOT NULL
    `);
    console.log('[MIGRATION] Backfilled existing records');

    console.log('[MIGRATION] Migration completed successfully!');

  } catch (error) {
    console.error('[MIGRATION] Error:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runMigration();
const mysql = require('mysql2/promise');
const config = require('./config');

async function runMigration() {
  let connection;

  try {
    console.log('[MIGRATION] Starting template parameters migration...');

    connection = await mysql.createConnection(config);

    console.log('[MIGRATION] Connected to database');

    // Create template_parameters table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS template_parameters (
        id SERIAL PRIMARY KEY,
        template_id INTEGER REFERENCES equipment_templates(id) ON DELETE CASCADE,
        label VARCHAR(100) NOT NULL,
        source VARCHAR(255) NOT NULL,
        unit VARCHAR(20),
        normal_value DECIMAL(15,2),
        warning_min DECIMAL(15,2),
        warning_max DECIMAL(15,2),
        alarm_min DECIMAL(15,2),
        alarm_max DECIMAL(15,2),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(template_id, source)
      )
    `);
    console.log('[MIGRATION] Created template_parameters table');

    // Create indexes
    await connection.execute(`
      CREATE INDEX IF NOT EXISTS idx_template_params_template ON template_parameters(template_id)
    `);
    await connection.execute(`
      CREATE INDEX IF NOT EXISTS idx_template_params_active ON template_parameters(is_active)
    `);
    console.log('[MIGRATION] Created indexes');

    // Add protocol column to equipment_templates
    await connection.execute(`
      ALTER TABLE equipment_templates ADD COLUMN IF NOT EXISTS protocol VARCHAR(50) DEFAULT 'snmp'
    `);
    console.log('[MIGRATION] Added protocol column');

    // Update existing templates
    await connection.execute(`
      UPDATE equipment_templates SET protocol = 'snmp' WHERE protocol IS NULL OR protocol = ''
    `);
    console.log('[MIGRATION] Updated existing templates');

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
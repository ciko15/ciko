/**
 * Database Migration Script for Equipment Logs
 * Menambahkan kolom baru untuk format 6 kolom:
 * 1. ID (sudah ada)
 * 2. equipment_name (Nama Alat)
 * 3. status (Status)
 * 4. data (Keterangan - sudah ada)
 * 5. logged_at (Waktu Update - sudah ada)
 * 6. airport_name (Bandara)
 */

const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool(config);

async function migrate() {
  console.log('🔄 Starting database migration for equipment_logs...');
  console.log('=====================================================\n');

  try {
    // Check current columns
    console.log('📋 Checking current table structure...');
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'equipment_logs'
      ORDER BY ordinal_position;
    `);
    
    const existingColumns = checkResult.rows.map(r => r.column_name);
    console.log('Existing columns:', existingColumns.join(', '));

    // Add new columns if they don't exist
    const columnsToAdd = [
      { name: 'equipment_name', type: 'VARCHAR(255)' },
      { name: 'status', type: 'VARCHAR(20)' },
      { name: 'airport_name', type: 'VARCHAR(255)' },
      { name: 'airport_city', type: 'VARCHAR(255)' }
    ];

    for (const col of columnsToAdd) {
      if (!existingColumns.includes(col.name)) {
        console.log(`➕ Adding column: ${col.name} (${col.type})`);
        await pool.query(`
          ALTER TABLE equipment_logs 
          ADD COLUMN ${col.name} ${col.type};
        `);
        console.log(`   ✅ Column ${col.name} added successfully`);
      } else {
        console.log(`   ℹ️  Column ${col.name} already exists`);
      }
    }

    // Create indexes for better performance
    console.log('\n📊 Creating indexes...');
    const indexes = [
      { name: 'idx_logs_equipment_name', column: 'equipment_name' },
      { name: 'idx_logs_status', column: 'status' },
      { name: 'idx_logs_airport', column: 'airport_name' }
    ];

    for (const idx of indexes) {
      try {
        await pool.query(`
          CREATE INDEX IF NOT EXISTS ${idx.name} ON equipment_logs(${idx.column});
        `);
        console.log(`   ✅ Index ${idx.name} created`);
      } catch (err) {
        console.log(`   ℹ️  Index ${idx.name} may already exist`);
      }
    }

    // Create view for easy querying
    console.log('\n👁️  Creating view...');
    await pool.query(`
      CREATE OR REPLACE VIEW equipment_logs_view AS
      SELECT 
        l.id as "ID",
        COALESCE(l.equipment_name, e.name) as "Nama Alat",
        COALESCE(l.status, l.data->>'status', 'Unknown') as "Status",
        l.data as "Keterangan",
        l.logged_at as "Waktu Update",
        COALESCE(l.airport_name, a.name, 'Unknown') as "Bandara"
      FROM equipment_logs l
      LEFT JOIN equipment e ON l.equipment_id = e.id
      LEFT JOIN airports a ON e.airport_id = a.id
      ORDER BY l.logged_at DESC;
    `);
    console.log('   ✅ View equipment_logs_view created');

    // Verify final structure
    console.log('\n✅ Migration completed!');
    console.log('📋 Final table structure:');
    const finalResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'equipment_logs'
      ORDER BY ordinal_position;
    `);
    
    finalResult.rows.forEach(row => {
      console.log(`   • ${row.column_name}: ${row.data_type}`);
    });

    console.log('\n🎉 Database migration successful!');
    console.log('You can now run the scheduler with 6-column format.');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();

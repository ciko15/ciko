/**
 * Migration: Add is_active column to equipment table
 * 
 * This migration adds the is_active column to track whether equipment
 * should be counted in dashboard statistics or hidden.
 */

const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool(config);

async function migrate() {
  console.log('[Migration] Starting migration: Add is_active to equipment table');
  
  try {
    // Check if is_active column exists
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'equipment' AND column_name = 'is_active'
    `);
    
    if (checkResult.rows.length > 0) {
      console.log('[Migration] Column is_active already exists in equipment table');
    } else {
      // Add is_active column with default value true
      await pool.query(`
        ALTER TABLE equipment 
        ADD COLUMN is_active BOOLEAN DEFAULT true
      `);
      console.log('[Migration] Successfully added is_active column to equipment table');
    }
    
    // Update total_equipment calculations in airports to only count active equipment
    // This is handled in getAllAirports query which now uses:
    // (is_active = true OR is_active IS NULL)
    
    console.log('[Migration] Migration completed successfully');
    
  } catch (error) {
    console.error('[Migration] Error during migration:', error.message);
  } finally {
    await pool.end();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrate();
}

module.exports = migrate;

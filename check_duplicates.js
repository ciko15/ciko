const { Pool } = require('pg');
const config = require('./db/config');

const pool = new Pool(config);

async function checkDuplicates() {
  try {
    console.log('=== ANALISIS DATABASE BANDARA ===\n');
    
    // 1. Total count
    const totalResult = await pool.query('SELECT COUNT(*) as total FROM airports');
    console.log(`Total bandara di database: ${totalResult.rows[0].total}`);
    
    // 2. Check for duplicate names
    const duplicateNames = await pool.query(`
      SELECT name, COUNT(*) as count, array_agg(id) as ids
      FROM airports
      GROUP BY name
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `);
    
    console.log(`\n=== BANDARA DENGAN NAMA SAMA ===`);
    console.log(`Jumlah bandara yang double: ${duplicateNames.rows.length}`);
    
    duplicateNames.rows.forEach(row => {
      console.log(`\nNama: "${row.name}"`);
      console.log(`  Jumlah duplikat: ${row.count}`);
      console.log(`  IDs: ${row.ids.join(', ')}`);
    });
    
    // 3. Check for duplicate city + name combinations
    const duplicateCityName = await pool.query(`
      SELECT name, city, COUNT(*) as count, array_agg(id) as ids
      FROM airports
      GROUP BY name, city
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `);
    
    console.log(`\n=== BANDARA DENGAN NAMA & KOTA SAMA ===`);
    console.log(`Jumlah: ${duplicateCityName.rows.length}`);
    
    duplicateCityName.rows.forEach(row => {
      console.log(`\nNama: "${row.name}", Kota: "${row.city}"`);
      console.log(`  Jumlah duplikat: ${row.count}`);
      console.log(`  IDs: ${row.ids.join(', ')}`);
    });
    
    // 4. List all airports with parent info
    const allAirports = await pool.query(`
      SELECT a.id, a.name, a.city, a.parent_id, p.name as parent_name
      FROM airports a
      LEFT JOIN airports p ON a.parent_id = p.id
      ORDER BY a.parent_id NULLS FIRST, a.id
    `);
    
    console.log(`\n=== SEMUA BANDARA (${allAirports.rows.length} total) ===`);
    console.log('ID | Nama | Kota | Parent ID | Parent Name');
    console.log('---|------|------|-----------|------------');
    
    allAirports.rows.forEach(row => {
      console.log(`${row.id} | ${row.name} | ${row.city} | ${row.parent_id || '-'} | ${row.parent_name || '-'}`);
    });
    
    // 5. Check parent-child relationships
    const parentChild = await pool.query(`
      SELECT p.name as parent_name, 
             array_agg(c.name) as children,
             COUNT(*) as child_count
      FROM airports p
      JOIN airports c ON c.parent_id = p.id
      GROUP BY p.id, p.name
      ORDER BY p.name
    `);
    
    console.log(`\n=== RELASI PARENT-CHILD ===`);
    parentChild.rows.forEach(row => {
      console.log(`\n${row.parent_name} (${row.child_count} anak):`);
      row.children.forEach(child => {
        console.log(`  - ${child}`);
      });
    });
    
    // 6. Check if equipment is linked to duplicate airports
    const equipmentLinks = await pool.query(`
      SELECT a.name, a.id, COUNT(e.id) as equipment_count
      FROM airports a
      LEFT JOIN equipment e ON e.airport_id = a.id
      GROUP BY a.id, a.name
      HAVING COUNT(e.id) > 0
      ORDER BY equipment_count DESC
    `);
    
    console.log(`\n=== BANDARA DENGAN EQUIPMENT ===`);
    console.log(`Total bandara dengan equipment: ${equipmentLinks.rows.length}`);
    equipmentLinks.rows.forEach(row => {
      console.log(`ID ${row.id}: ${row.name} (${row.equipment_count} equipment)`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    pool.end();
  }
}

checkDuplicates();

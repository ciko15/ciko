const { Pool } = require('pg');
const config = require('./db/config');

const pool = new Pool(config);

async function cleanupDuplicates() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('=== MEMBERSIHKAN BANDARA DUPLIKAT ===\n');
    
    // 1. Cek equipment yang ter-link ke bandara duplikat
    const equipmentOnDuplicates = await client.query(`
      SELECT e.id, e.name, e.airport_id, a.name as airport_name
      FROM equipment e
      JOIN airports a ON e.airport_id = a.id
      WHERE a.id >= 497
    `);
    
    console.log(`Equipment di bandara duplikat: ${equipmentOnDuplicates.rows.length}`);
    equipmentOnDuplicates.rows.forEach(row => {
      console.log(`  - ${row.name} (ID: ${row.id}) -> ${row.airport_name} (ID: ${row.airport_id})`);
    });
    
    // 2. Update equipment yang ter-link ke bandara duplikat ke bandara asli
    if (equipmentOnDuplicates.rows.length > 0) {
      console.log('\n=== MEMPINDAHKAN EQUIPMENT KE BANDARA ASLI ===');
      
      // Mapping ID duplikat ke ID asli
      const idMapping = {
        497: 1,    // Sentani
        498: 2,    // Soekarno-Hatta
        499: 3,    // Husein Sastranegara
        500: 4,    // Sultan Hasanuddin
        501: 5,    // Sultan Babullah
        502: 6,    // El Tari
        503: 7,    // Kuala Namu
        504: 8,    // Juanda
        505: 9,    // Adisutjipto
        506: 10,   // Samsuddin Noor
        507: 11,   // Biak
        508: 12,   // Oksibil
        509: 13,   // Timika
        510: 14,   // Sultan Malikussaleh
        511: 15,   // Minangkabau
        512: 16,   // Sultan Syarif Kasim II
        513: 17,   // Sultan Mahmud Badaruddin II
        514: 18,   // Fatmawati Soekarno
        515: 19,   // Radin Inten II
        516: 20,   // Depati Amir
        517: 21,   // Raja Haji Fisabilillah
        518: 22,   // Hang Nadim
        519: 23,   // Halim Perdanakusuma
        520: 24,   // Adisumarmo
        521: 25,   // Ahmad Yani
        522: 26,   // Blimbingsari
        523: 27,   // Supadio
        524: 28,   // APT Pranoto
        525: 29,   // Temindung
        526: 30,   // Sam Ratulangi
        527: 31,   // Mutiara SIS Al-Jufrie
        528: 32,   // I Gusti Ngurah Rai
        529: 33,   // Lombok
        530: 34,   // Frans Sales Lega
        531: 35,   // Pattimura
        532: 36,   // Domine Eduard Osok
        533: null, // Frans Kaisiepo - bandara baru, tidak ada duplikat
        534: 38,   // Fakfak
        535: 39,   // Rendani
        536: 40    // Mopah
      };
      
      for (const [dupId, originalId] of Object.entries(idMapping)) {
        if (originalId) {
          const result = await client.query(`
            UPDATE equipment 
            SET airport_id = $1 
            WHERE airport_id = $2
            RETURNING id
          `, [originalId, dupId]);
          
          if (result.rowCount > 0) {
            console.log(`  Pindah ${result.rowCount} equipment dari ID ${dupId} ke ID ${originalId}`);
          }
        }
      }
    }
    
    // 3. Update parent_id untuk bandara anak yang mengarah ke duplikat
    console.log('\n=== MEMPERBAIKI PARENT-CHILD RELATIONSHIPS ===');
    
    const childAirports = await client.query(`
      SELECT id, name, parent_id 
      FROM airports 
      WHERE parent_id >= 497
    `);
    
    console.log(`Bandara anak dengan parent duplikat: ${childAirports.rows.length}`);
    
    // Mapping yang sama untuk parent_id
    const parentMapping = {
      497: 1, 498: 2, 499: 3, 500: 4, 501: 5, 502: 6, 503: 7, 504: 8,
      505: 9, 506: 10, 507: 11, 508: 12, 509: 13, 510: 14, 511: 15,
      512: 16, 513: 17, 514: 18, 515: 19, 516: 20, 517: 21, 518: 22,
      519: 23, 520: 24, 521: 25, 522: 26, 523: 27, 524: 28, 525: 29,
      526: 30, 527: 31, 528: 32, 529: 33, 530: 34, 531: 35, 532: 36,
      534: 38, 535: 39, 536: 40
    };
    
    for (const row of childAirports.rows) {
      const newParentId = parentMapping[row.parent_id];
      if (newParentId) {
        await client.query(`
          UPDATE airports SET parent_id = $1 WHERE id = $2
        `, [newParentId, row.id]);
        console.log(`  ${row.name} (ID: ${row.id}): parent ${row.parent_id} -> ${newParentId}`);
      }
    }
    
    // 4. Hapus bandara duplikat (ID >= 497)
    console.log('\n=== MENGHAPUS BANDARA DUPLIKAT ===');
    
    const deleteResult = await client.query(`
      DELETE FROM airports 
      WHERE id >= 497 
      RETURNING id, name
    `);
    
    console.log(`Dihapus ${deleteResult.rowCount} bandara duplikat:`);
    deleteResult.rows.forEach(row => {
      console.log(`  - ID ${row.id}: ${row.name}`);
    });
    
    // 5. Verifikasi hasil
    const finalCount = await client.query('SELECT COUNT(*) as total FROM airports');
    console.log(`\n=== HASIL AKHIR ===`);
    console.log(`Total bandara setelah cleanup: ${finalCount.rows[0].total}`);
    console.log(`Seharusnya: 41 bandara (40 utama + 1 Frans Kaisiepo)`);
    
    // 6. List semua bandara yang tersisa
    const remaining = await client.query(`
      SELECT a.id, a.name, a.city, a.parent_id, p.name as parent_name,
             COUNT(e.id) as equipment_count
      FROM airports a
      LEFT JOIN airports p ON a.parent_id = p.id
      LEFT JOIN equipment e ON e.airport_id = a.id
      GROUP BY a.id, a.name, a.city, a.parent_id, p.name
      ORDER BY a.id
    `);
    
    console.log(`\n=== BANDARA YANG TERSISA (${remaining.rows.length}) ===`);
    console.log('ID | Nama | Kota | Parent | Equipment');
    console.log('---|------|------|--------|----------');
    remaining.rows.forEach(row => {
      const parent = row.parent_name || '-';
      console.log(`${row.id} | ${row.name} | ${row.city} | ${parent} | ${row.equipment_count}`);
    });
    
    await client.query('COMMIT');
    console.log('\n✅ Cleanup berhasil!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error);
    throw error;
  } finally {
    client.release();
    pool.end();
  }
}

cleanupDuplicates().catch(console.error);

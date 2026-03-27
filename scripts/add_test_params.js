const mysql = require('mysql2/promise');
const config = require('./db/config');

async function addParameters() {
  const conn = await mysql.createConnection(config);
  
  const params = [
    [1, 'MON1 Reply Efficiency', 'm1_reply_eff', '%', 75, null, 70, null],
    [1, 'MON1 Forward Power', 'm1_fwd_power', 'W', 850, null, 800, null],
    [2, 'Bearing Alignment', 'bearing_alignment', 'deg', 0.5, null, 1.0, null],
  ];
  
  for (const p of params) {
    try {
      await conn.execute(
        'INSERT INTO template_parameters (template_id, label, source, unit, warning_min, warning_max, alarm_min, alarm_max) VALUES (?,?,?,?,?,?,?,?)',
        p
      );
      console.log('✓ Added:', p[1]);
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') {
        console.log('✓ Already exists:', p[1]);
      } else {
        console.error('Error:', e.message);
      }
    }
  }
  
  const [result] = await conn.execute('SELECT COUNT(*) as count FROM template_parameters');
  console.log('\n✅ Total parameters in DB:', result[0].count);
  
  const [params_result] = await conn.execute(
    'SELECT id, template_id, label, source FROM template_parameters ORDER BY template_id'
  );
  console.log('\nDatabase parameters:');
  params_result.forEach(p => {
    console.log(`  - [${p.id}] Template ${p.template_id}: ${p.label} (${p.source})`);
  });
  
  await conn.end();
}

addParameters().catch(console.error);

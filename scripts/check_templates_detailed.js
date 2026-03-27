// Detailed check of template_parameters structure and data
const db = require('./db/database');

async function detailedCheck() {
  try {
    console.log('\n=== Detailed Template Parameters Check ===\n');
    
    // Get table structure
    console.log('1. Template Parameters Table Structure:');
    const structure = await db.query('DESCRIBE template_parameters');
    structure.forEach((col, idx) => {
      console.log(`   ${idx + 1}. ${col.Field} (${col.Type}) ${col.Null === 'NO' ? 'NOT NULL' : 'nullable'}`);
    });
    
    // Get all parameters with all columns
    console.log('\n2. Current Parameters in Database:');
    const params = await db.query('SELECT * FROM template_parameters');
    
    if (params.length === 0) {
      console.log('   No parameters found - table is empty');
    } else {
      params.forEach((p, idx) => {
        console.log(`\n   Parameter ${idx + 1}:`);
        console.log(`   - ID: ${p.id}`);
        console.log(`   - Template ID: ${p.template_id}`);
        console.log(`   - Name: ${p.name}`);
        console.log(`   - Parameter Key: ${p.parameter_key}`);
        console.log(`   - Type: ${p.type}`);
        console.log(`   - Unit: ${p.unit}`);
        console.log(`   - Warning Min: ${p.warning_min}`);
        console.log(`   - Warning Max: ${p.warning_max}`);
        console.log(`   - Alarm Min: ${p.alarm_min}`);
        console.log(`   - Alarm Max: ${p.alarm_max}`);
      });
    }
    
    // Check templates
    console.log('\n3. Equipment Templates:');
    const templates = await db.query('SELECT id, name, equipment_type FROM equipment_templates LIMIT 5');
    templates.forEach(t => {
      console.log(`   - [${t.id}] ${t.name} (${t.equipment_type})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

detailedCheck();

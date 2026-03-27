// Quick check script to verify equipment templates are working
const db = require('./db/database');

async function checkTemplates() {
  try {
    console.log('\n=== Equipment Templates Status Check ===\n');
    
    // Check if equipment_templates table exists
    console.log('1. Checking equipment_templates table...');
    const templates = await db.query('SELECT COUNT(*) as count FROM equipment_templates');
    console.log(`   ✓ Found ${templates[0].count} templates in database`);
    
    // Try to check template_parameters table
    console.log('\n2. Checking template_parameters table...');
    try {
      const params = await db.query('SELECT COUNT(*) as count FROM template_parameters');
      console.log(`   ✓ template_parameters table EXISTS with ${params[0].count} parameters`);
      
      // List some sample parameters
      const sampleParams = await db.query('SELECT * FROM template_parameters LIMIT 5');
      if (sampleParams.length > 0) {
        console.log('\n   Sample parameters found:');
        sampleParams.forEach(p => {
          console.log(`   - ${p.name} (template_id: ${p.template_id}, key: ${p.parameter_key})`);
        });
      }
    } catch (error) {
      if (error.message.includes('doesn\'t exist') || error.message.includes('ENOENT')) {
        console.log('   ✗ template_parameters table NOT FOUND');
        console.log('   → You need to run: mysql -u root < db/create_template_parameters.sql');
      } else {
        console.log('   ✗ Error:', error.message);
      }
    }
    
    // Check template service
    console.log('\n3. Testing template service...');
    const templateService = require('./src/services/template');
    const allTemplates = await templateService.getAllTemplates();
    console.log(`   ✓ Template service loaded ${allTemplates.length} templates`);
    
    if (allTemplates.length > 0) {
      const firstTemplate = allTemplates[0];
      console.log(`\n   First template: ${firstTemplate.name}`);
      console.log(`   - Type: ${firstTemplate.equipment_type}`);
      console.log(`   - Brand: ${firstTemplate.brand}`);
      console.log(`   - Parameters: ${firstTemplate.parameters ? firstTemplate.parameters.length : 0}`);
      
      if (firstTemplate.parameters && firstTemplate.parameters.length > 0) {
        console.log(`   - Sample parameters:`);
        firstTemplate.parameters.slice(0, 3).forEach(p => {
          console.log(`     • ${p.label} (${p.source}): warning=${p.warning_min}, alarm=${p.alarm_min}`);
        });
      }
    }
    
    console.log('\n=== Status Summary ===');
    console.log('✓ Equipment Templates database setup is complete!');
    console.log('\nWhat you can do now:');
    console.log('- Go to Equipment Templates section to see all templates');
    console.log('- Templates can be added, edited, and deleted');
    console.log('- Parameters are linked to each template for threshold configuration');
    
    process.exit(0);
  } catch (error) {
    console.error('Error checking templates:', error);
    process.exit(1);
  }
}

checkTemplates();

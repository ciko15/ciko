
const db = require('./db/database');

async function check() {
  try {
    console.log('--- USERS ---');
    const users = await db.getAllUsers();
    console.log(`Found ${users.length} users:`);
    console.log(JSON.stringify(users, null, 2));

    console.log('\n--- SNMP TEMPLATES ---');
    const templates = await db.getAllSnmpTemplates();
    console.log(`Found ${templates.length} templates:`);
    console.log(JSON.stringify(templates, null, 2));

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

check();

const bcrypt = require('bcryptjs');
const db = require('./db/database');

async function testLogin() {
  console.log('Testing login with admin/admin123...\n');
  
  const user = await db.findUserByUsername('admin');
  if (!user) {
    console.log('❌ User admin not found in database');
    return;
  }
  
  console.log('✓ User found:', user.username);
  console.log('  Role:', user.role);
  console.log('  Password hash:', user.password.substring(0, 30) + '...');
  
  const password = 'admin123';
  const validPassword = await bcrypt.compare(password, user.password);
  
  console.log('\nPassword verification:');
  console.log('  Input password:', password);
  console.log('  Valid:', validPassword ? '✓ YES' : '❌ NO');
  
  if (validPassword) {
    console.log('\n✅ Login should work! Database is correct.');
  } else {
    console.log('\n❌ Password mismatch! Need to reinitialize database.');
    console.log('   Run: node db/init.js --force');
  }
}

testLogin()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });

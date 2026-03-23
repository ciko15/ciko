const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool(config);

const saltRounds = 10;

// Demo users with plaintext passwords (will be hashed)
const demoUsers = [
  { username: 'admin', password: 'admin123', name: 'Administrator', role: 'admin', branch_id: null },
  { username: 'pusat', password: 'pusat123', name: 'User Pusat', role: 'user_pusat', branch_id: null },
  { username: 'teknisi_jayapura', password: 'teknisi123', name: 'Teknisi Jayapura', role: 'teknisi_cabang', branch_id: 1 },
  { username: 'user', password: 'tester123', name: 'User Demo', role: 'user_cabang', branch_id: 2 }
];

async function initializeDatabase() {
  try {
    console.log('[INIT] Starting database initialization...');
    
    // Check if users table exists and has data
    const checkResult = await pool.query('SELECT COUNT(*) as count FROM users');
    const userCount = parseInt(checkResult.rows[0].count);
    
    if (userCount > 0) {
      console.log(`[INIT] Users table already has ${userCount} users. Skipping initialization.`);
      console.log('[INIT] To reinitialize, run: node db/init.js --force');
      
      // Check if passwords are hashed (bcrypt hashes start with $2)
      const sampleUser = await pool.query('SELECT password FROM users LIMIT 1');
      const password = sampleUser.rows[0]?.password;
      
      if (password && !password.startsWith('$2')) {
        console.log('[WARNING] Existing passwords are NOT hashed! Run with --force to fix.');
      }
      
      process.exit(0);
    }
    
    console.log('[INIT] Creating demo users with hashed passwords...');
    
    for (const user of demoUsers) {
      const hashedPassword = await bcrypt.hash(user.password, saltRounds);
      
      await pool.query(`
        INSERT INTO users (username, password, name, role, branch_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (username) DO UPDATE SET
          password = EXCLUDED.password,
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          branch_id = EXCLUDED.branch_id
      `, [user.username, hashedPassword, user.name, user.role, user.branch_id]);
      
      console.log(`[INIT] Created user: ${user.username} (${user.role})`);
    }
    
    console.log('[INIT] Database initialization completed successfully!');
    console.log('');
    console.log('Demo Accounts:');
    console.log('  Admin:     admin / admin123');
    console.log('  Pusat:     pusat / pusat123');
    console.log('  Teknisi:   teknisi_jayapura / teknisi123');
    console.log('  User:      user / tester123');
    
  } catch (error) {
    console.error('[INIT] Error initializing database:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Handle --force flag to reinitialize
if (process.argv.includes('--force')) {
  console.log('[INIT] Force mode enabled - will reinitialize all users...');
  
  (async () => {
    try {
      // Delete existing users
      await pool.query('DELETE FROM users');
      console.log('[INIT] Cleared existing users');
      await initializeDatabase();
    } catch (error) {
      console.error('[INIT] Error in force mode:', error);
      process.exit(1);
    }
  })();
} else {
  initializeDatabase();
}

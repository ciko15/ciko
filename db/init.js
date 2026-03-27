const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const config = require('./config');

const saltRounds = 10;

// Demo users with plaintext passwords (will be hashed)
const demoUsers = [
  { username: 'admin', password: 'admin123', name: 'Administrator', role: 'admin', branch_id: null },
  { username: 'pusat', password: 'pusat123', name: 'User Pusat', role: 'user_pusat', branch_id: null },
  { username: 'teknisi_jayapura', password: 'teknisi123', name: 'Teknisi Jayapura', role: 'teknisi_cabang', branch_id: 1 },
  { username: 'user', password: 'tester123', name: 'User Demo', role: 'user_cabang', branch_id: 2 }
];

async function initializeDatabase() {
  let connection;
  try {
    console.log('[INIT] Starting database initialization...');
    
    // Create connection
    connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database
    });

    // Check if users table exists and has data
    const [rows] = await connection.query('SELECT COUNT(*) as count FROM users');
    const userCount = parseInt(rows[0].count);
    
    if (userCount > 0 && !process.argv.includes('--force')) {
      console.log(`[INIT] Users table already has ${userCount} users. Skipping initialization.`);
      console.log('[INIT] To reinitialize, run: bun run db/init.js --force');
      
      // Check if passwords are hashed (bcrypt hashes start with $2)
      const [sampleRows] = await connection.query('SELECT password FROM users LIMIT 1');
      const password = sampleRows[0]?.password;
      
      if (password && !password.startsWith('$2')) {
        console.log('[WARNING] Existing passwords are NOT hashed! Run with --force to fix.');
      }
      
      process.exit(0);
    }
    
    if (process.argv.includes('--force')) {
      console.log('[INIT] Force mode enabled - clearing existing users...');
      await connection.query('DELETE FROM users');
    }

    console.log('[INIT] Creating demo users with hashed passwords...');
    
    for (const user of demoUsers) {
      const hashedPassword = await bcrypt.hash(user.password, saltRounds);
      
      // MySQL "ON DUPLICATE KEY UPDATE" syntax
      await connection.query(`
        INSERT INTO users (username, password, name, role, branch_id)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          password = VALUES(password),
          name = VALUES(name),
          role = VALUES(role),
          branch_id = VALUES(branch_id)
      `, [user.username, hashedPassword, user.name, user.role, user.branch_id]);
      
      console.log(`[INIT] Created/Updated user: ${user.username} (${user.role})`);
    }
    
    console.log('[INIT] Database initialization completed successfully!');
    console.log('');
    console.log('Demo Accounts:');
    console.log('  Admin:     admin / admin123');
    console.log('  Pusat:     pusat / pusat123');
    console.log('  Teknisi:   teknisi_jayapura / teknisi123');
    console.log('  User:      user / tester123');
    
    process.exit(0);
  } catch (error) {
    console.error('[INIT] Error initializing database:', error);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

initializeDatabase();

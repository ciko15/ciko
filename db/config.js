require('dotenv').config();

module.exports = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'db_2',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  socketPath: process.env.DB_SOCKET_PATH || null
};

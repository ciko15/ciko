const mysql = require('mysql2/promise');
const config = require('./config');

// Create pool with socket connection for XAMPP
const pool = mysql.createPool({
  host: config.host,
  port: config.port,
  database: config.database,
  user: config.user,
  password: config.password,
  socketPath: '/Applications/XAMPP/xamppfiles/var/mysql/mysql.sock',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err);
});

// Generic query function for EquipmentService and other modules
// This provides a simple interface similar to pg (PostgreSQL) or other DB drivers
async function query(sql, params = []) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (error) {
    console.error('[DB] Query error:', error.message);
    throw error;
  }
}

// ==================== AIRPORTS ====================

async function getAllAirports() {
  const [rows] = await pool.query(`
    SELECT a.*, 
           (SELECT name FROM airports WHERE id = a.parent_id) as parent_name,
           (SELECT COUNT(*) FROM equipment WHERE airport_id = a.id) as total_equipment
    FROM airports a
    ORDER BY a.id
  `);
  return rows.map(row => ({
    ...row,
    ip_branch: row.ip_branch || `172.19.16.${(row.id % 254) + 1}`,
    ipBranch: row.ip_branch || `172.19.16.${(row.id % 254) + 1}`,
    parentId: row.parent_id,
    parentName: row.parent_name
  }));
}

async function getAirportsPaginated(options = {}) {
  const { page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;
  
  const [[countResult]] = await pool.query('SELECT COUNT(*) as total FROM airports');
  const total = parseInt(countResult?.total || 0);
  
  const [rows] = await pool.query(`
    SELECT a.*, 
           (SELECT name FROM airports WHERE id = a.parent_id) as parent_name,
           (SELECT COUNT(*) FROM equipment WHERE airport_id = a.id) as total_equipment
    FROM airports a
    ORDER BY a.id
    LIMIT ? OFFSET ?
  `, [limit, offset]);
  
  const data = rows.map(row => ({
    ...row,
    ip_branch: row.ip_branch || `172.19.16.${(row.id % 254) + 1}`,
    ipBranch: row.ip_branch || `172.19.16.${(row.id % 254) + 1}`,
    parentId: row.parent_id,
    parentName: row.parent_name
  }));
  
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

async function getAirportById(id) {
  const [rows] = await pool.query(`
    SELECT a.*, 
           (SELECT name FROM airports WHERE id = a.parent_id) as parent_name,
           (SELECT COUNT(*) FROM equipment WHERE airport_id = a.id) as total_equipment
    FROM airports a
    WHERE a.id = ?
  `, [id]);
  if (!rows[0]) return null;
  return {
    ...rows[0],
    ip_branch: rows[0].ip_branch || `172.19.16.${(rows[0].id % 254) + 1}`,
    ipBranch: rows[0].ip_branch || `172.19.16.${(rows[0].id % 254) + 1}`,
    parentId: rows[0].parent_id,
    parentName: rows[0].parent_name
  };
}

async function createAirport(data) {
  const [result] = await pool.query(`
    INSERT INTO airports (name, city, lat, lng, parent_id, ip_branch)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [data.name, data.city, data.lat, data.lng, data.parentId, data.ipBranch]);
  
  const [rows] = await pool.query('SELECT * FROM airports WHERE id = ?', [result.insertId]);
  return {
    ...rows[0],
    parentId: rows[0].parent_id
  };
}

async function updateAirport(id, data) {
  const fields = [];
  const values = [];
  
  if (data.name !== undefined) {
    fields.push(`name = ?`);
    values.push(data.name);
  }
  if (data.city !== undefined) {
    fields.push(`city = ?`);
    values.push(data.city);
  }
  if (data.lat !== undefined) {
    fields.push(`lat = ?`);
    values.push(data.lat);
  }
  if (data.lng !== undefined) {
    fields.push(`lng = ?`);
    values.push(data.lng);
  }
  if (data.hasOwnProperty('parentId')) {
    fields.push(`parent_id = ?`);
    values.push(data.parentId === '' ? null : data.parentId);
  }
  if (data.ipBranch !== undefined) {
    fields.push(`ip_branch = ?`);
    values.push(data.ipBranch);
  }
  
  if (fields.length === 0) return getAirportById(id);
  
  values.push(id);
  await pool.query(`UPDATE airports SET ${fields.join(', ')} WHERE id = ?`, values);
  
  const [rows] = await pool.query('SELECT * FROM airports WHERE id = ?', [id]);
  return {
    ...rows[0],
    parentId: rows[0].parent_id
  };
}

async function deleteAirport(id) {
  const [[equipmentResult]] = await pool.query(
    'SELECT COUNT(*) as count FROM equipment WHERE airport_id = ?',
    [id]
  );
  
  if (parseInt(equipmentResult?.count || 0) > 0) {
    throw new Error(`Cannot delete airport: ${equipmentResult.count} equipment(s) still exist at this airport`);
  }
  
  const [[childResult]] = await pool.query(
    'SELECT COUNT(*) as count FROM airports WHERE parent_id = ?',
    [id]
  );
  
  if (parseInt(childResult?.count || 0) > 0) {
    throw new Error(`Cannot delete airport: ${childResult.count} child airport(s) are linked to this airport`);
  }
  
  await pool.query('UPDATE users SET branch_id = NULL WHERE branch_id = ?', [id]);
  await pool.query('DELETE FROM airports WHERE id = ?', [id]);
}

// ==================== EQUIPMENT ====================

async function getAllEquipment(filters = {}) {
  let query = `
    SELECT e.*, a.name as airport_name, b.name as branch_name
    FROM equipment e
    LEFT JOIN airports a ON e.airport_id = a.id
    LEFT JOIN airports b ON e.branch_id = b.id
    WHERE 1=1
  `;
  const values = [];
  
  // Support filtering by branch (preferred) and fallback to airport for legacy data
  const branchFilter = filters.branchId || filters.airportId;
  if (branchFilter) {
    query += ` AND (e.branch_id = ? OR (e.branch_id IS NULL AND e.airport_id = ?))`;
    values.push(branchFilter, branchFilter);
  }
  if (filters.category) {
    query += ` AND e.category = ?`;
    values.push(filters.category);
  }
  if (filters.isActive !== undefined) {
    // Handle both is_active = true AND is_active IS NULL (defaults to active)
    if (filters.isActive === 'all') {
      // JANGAN tambahkan filter is_active agar mengembalikan SEMUA data (Active & Inactive)
    } else if (filters.isActive === true) {
      query += ` AND (e.is_active = 1 OR e.is_active IS NULL)`;
    } else {
      query += ` AND e.is_active = ?`;
      values.push(filters.isActive);
    }
  }
  
  let countQuery = query.replace('SELECT e.*, a.name as airport_name', 'SELECT COUNT(*) as total');
  const [countResult] = await pool.query(countQuery, values);
  const total = parseInt(countResult[0]?.total || 0);
  
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const offset = (page - 1) * limit;
  
  query += ` ORDER BY e.id LIMIT ? OFFSET ?`;
  values.push(limit, offset);
  
  const [rows] = await pool.query(query, values);
  
  const data = rows.map(row => {
    let snmpConfig = row.snmp_config;
    if (typeof snmpConfig === 'string') {
      try {
        snmpConfig = JSON.parse(snmpConfig);
      } catch (e) {
        snmpConfig = { enabled: false };
      }
    }
    // Map is_active from database to isActive for frontend
    let isActive = true;
    if (row.is_active !== null && row.is_active !== undefined) {
      if (row.is_active === 0 || row.is_active === '0' || row.is_active === false || row.is_active === 'false') {
        isActive = false;
      } else if (Buffer.isBuffer(row.is_active)) {
        isActive = row.is_active[0] !== 0;
      } else {
        isActive = Boolean(row.is_active);
      }
    }
    // Get IP address from database column or from snmpConfig
    const ipAddress = row.ip_address || (snmpConfig && snmpConfig.ip) || '';
    
    const branchId = row.branch_id || row.airport_id;
    const branchName = row.branch_name || row.airport_name;

    return {
      ...row,
      is_active: isActive,
      isActive: isActive,
      ip_address: ipAddress,
      ipAddress: ipAddress,
      snmp_config: snmpConfig,
      snmpConfig: snmpConfig,
      airportName: row.airport_name,
      airportId: row.airport_id,
      branchName: branchName,
      branchId: branchId,
      hasSnmp: snmpConfig && snmpConfig.enabled
    };
  });
  
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

async function getEquipmentStatsSummary() {
  try {
    const [statusRows] = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM equipment 
      WHERE (is_active = 1 OR is_active IS NULL)
      GROUP BY status
    `);
    
    const [categoryRows] = await pool.query(`
      SELECT category, COUNT(*) as count 
      FROM equipment 
      WHERE (is_active = 1 OR is_active IS NULL)
      GROUP BY category
    `);
    
    const [[totalRow]] = await pool.query(`
      SELECT COUNT(*) as total 
      FROM equipment 
      WHERE (is_active = 1 OR is_active IS NULL)
    `);

    return {
      statuses: statusRows || [],
      categories: categoryRows || [],
      total: parseInt(totalRow?.total || 0)
    };
  } catch (error) {
    console.error('[DB] getEquipmentStatsSummary error:', error.message);
    // Jika query gagal, kembalikan format kosong yang aman (tidak merusak UI)
    return { statuses: [], categories: [], total: 0 };
  }
}

async function getEquipmentById(id) {
  const [rows] = await pool.query(`
    SELECT e.*, a.name as airport_name, b.name as branch_name
    FROM equipment e
    LEFT JOIN airports a ON e.airport_id = a.id
    LEFT JOIN airports b ON e.branch_id = b.id
    WHERE e.id = ?
  `, [id]);
  if (!rows[0]) return null;
  
  let snmpConfig = rows[0].snmp_config;
  if (typeof snmpConfig === 'string') {
    try {
      snmpConfig = JSON.parse(snmpConfig);
    } catch (e) {
      snmpConfig = { enabled: false };
    }
  }
  let isActive = true;
  if (rows[0].is_active !== null && rows[0].is_active !== undefined) {
    if (rows[0].is_active === 0 || rows[0].is_active === '0' || rows[0].is_active === false || rows[0].is_active === 'false') {
      isActive = false;
    } else if (Buffer.isBuffer(rows[0].is_active)) {
      isActive = rows[0].is_active[0] !== 0;
    } else {
      isActive = Boolean(rows[0].is_active);
    }
  }
  const ipAddress = rows[0].ip_address || (snmpConfig && snmpConfig.ip) || '';
  
  const branchId = rows[0].branch_id || rows[0].airport_id;
  const branchName = rows[0].branch_name || rows[0].airport_name;

  return {
    ...rows[0],
    is_active: isActive,
    snmp_config: snmpConfig,
    snmpConfig: snmpConfig,
    airportName: rows[0].airport_name,
    airportId: rows[0].airport_id,
    branchName: branchName,
    branchId: branchId,
    hasSnmp: snmpConfig && snmpConfig.enabled,
    ipAddress: ipAddress
  };
}

async function createEquipment(data) {
  const isActive = data.isActive !== undefined ? data.isActive : true;
  const branchId = data.branchId || data.airportId || null;
  const ipAddress = data.ipAddress || (data.snmpConfig && data.snmpConfig.ip) || '';
  
  const [result] = await pool.query(`
    INSERT INTO equipment (name, code, category, status, airport_id, branch_id, description, snmp_config, is_active, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [data.name, data.code, data.category, data.status, data.airportId, branchId, data.description, JSON.stringify(data.snmpConfig), isActive, ipAddress]);
  
  const [rows] = await pool.query('SELECT * FROM equipment WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function updateEquipment(id, data) {
  const fields = [];
  const values = [];
  
  if (data.name !== undefined) {
    fields.push(`name = ?`);
    values.push(data.name);
  }
  if (data.code !== undefined) {
    fields.push(`code = ?`);
    values.push(data.code);
  }
  if (data.category !== undefined) {
    fields.push(`category = ?`);
    values.push(data.category);
  }
  if (data.status !== undefined) {
    fields.push(`status = ?`);
    values.push(data.status);
  }
  const branchId = data.branchId !== undefined ? data.branchId : (data.airportId !== undefined ? data.airportId : undefined);
  const ipAddress = data.ipAddress !== undefined ? data.ipAddress : (data.snmpConfig && data.snmpConfig.ip) || undefined;

  if (data.airportId !== undefined) {
    fields.push(`airport_id = ?`);
    values.push(data.airportId);
  }
  if (branchId !== undefined) {
    fields.push(`branch_id = ?`);
    values.push(branchId);
  }
  if (data.description !== undefined) {
    fields.push(`description = ?`);
    values.push(data.description);
  }
  if (data.snmpConfig !== undefined) {
    fields.push(`snmp_config = ?`);
    values.push(JSON.stringify(data.snmpConfig));
  }
  if (ipAddress !== undefined) {
    fields.push(`ip_address = ?`);
    values.push(ipAddress);
  }
  if (data.isActive !== undefined) {
    fields.push(`is_active = ?`);
    values.push(data.isActive);
  }
  
  if (fields.length === 0) return getEquipmentById(id);
  
  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);
  
  await pool.query(`UPDATE equipment SET ${fields.join(', ')} WHERE id = ?`, values);
  
  const [rows] = await pool.query('SELECT * FROM equipment WHERE id = ?', [id]);
  return rows[0];
}

async function updateEquipmentStatus(id, status) {
  await pool.query(`
    UPDATE equipment SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [status, id]);
  
  const [rows] = await pool.query('SELECT * FROM equipment WHERE id = ?', [id]);
  return rows[0];
}

async function deleteEquipment(id) {
  await pool.query('DELETE FROM equipment WHERE id = ?', [id]);
}

// ==================== USERS ====================

async function getAllUsers(filters = {}) {
  let query = `
    SELECT u.id, u.username, u.name, u.role, u.branch_id,
           a.name as branch_name
    FROM users u
    LEFT JOIN airports a ON u.branch_id = a.id
    WHERE 1=1
  `;
  const values = [];
  
  if (filters.search) {
    query += ` AND (u.name LIKE ? OR u.username LIKE ?)`;
    values.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  
  query += ` ORDER BY u.id`;
  
  const [rows] = await pool.query(query, values);
  return rows;
}

async function findUserByUsername(username) {
  const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
  return rows[0];
}

async function getUserById(id) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0];
}

async function createUser(data) {
  const [result] = await pool.query(`
    INSERT INTO users (username, password, name, role, branch_id)
    VALUES (?, ?, ?, ?, ?)
  `, [data.username, data.password, data.name, data.role, data.branchId ? parseInt(data.branchId) : null]);
  
  const [rows] = await pool.query('SELECT id, username, name, role, branch_id FROM users WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function updateUser(id, data) {
  const fields = [];
  const values = [];
  
  if (data.username !== undefined) {
    fields.push(`username = ?`);
    values.push(data.username);
  }
  if (data.name !== undefined) {
    fields.push(`name = ?`);
    values.push(data.name);
  }
  if (data.role !== undefined) {
    fields.push(`role = ?`);
    values.push(data.role);
  }
  if (data.password !== undefined) {
    fields.push(`password = ?`);
    values.push(data.password);
  }
  
  if (fields.length === 0) return getUserById(id);
  
  values.push(id);
  await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
  
  const [rows] = await pool.query('SELECT id, username, name, role, branch_id FROM users WHERE id = ?', [id]);
  return rows[0];
}

async function deleteUser(id) {
  await pool.query('DELETE FROM users WHERE id = ?', [id]);
}

// ==================== SNMP TEMPLATES ====================

async function getAllSnmpTemplates() {
  const [rows] = await pool.query('SELECT * FROM snmp_templates ORDER BY is_default DESC, name');
  return rows.map(row => ({
    ...row,
    oidMappings: row.oid_mappings,
    oidBase: row.oid_base,
    category: row.category
  }));
}

async function getSnmpTemplateById(id) {
  const [rows] = await pool.query('SELECT * FROM snmp_templates WHERE id = ?', [id]);
  if (!rows[0]) return null;
  return {
    ...rows[0],
    oidMappings: rows[0].oid_mappings,
    oidBase: rows[0].oid_base,
    category: rows[0].category
  };
}

async function createSnmpTemplate(data) {
  const [result] = await pool.query(`
    INSERT INTO snmp_templates (id, name, description, oid_base, oid_mappings, category, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [data.id, data.name, data.description, data.oidBase, JSON.stringify(data.oidMappings), data.category || null, data.isDefault || false]);
  
  const [rows] = await pool.query('SELECT * FROM snmp_templates WHERE id = ?', [data.id]);
  return {
    ...rows[0],
    oidMappings: rows[0].oid_mappings,
    oidBase: rows[0].oid_base
  };
}

async function updateSnmpTemplate(id, data) {
  const fields = [];
  const values = [];
  
  if (data.name !== undefined) {
    fields.push(`name = ?`);
    values.push(data.name);
  }
  if (data.description !== undefined) {
    fields.push(`description = ?`);
    values.push(data.description);
  }
  if (data.oidBase !== undefined) {
    fields.push(`oid_base = ?`);
    values.push(data.oidBase);
  }
  if (data.oidMappings !== undefined) {
    fields.push(`oid_mappings = ?`);
    values.push(JSON.stringify(data.oidMappings));
  }
  if (data.category !== undefined) {
    fields.push(`category = ?`);
    values.push(data.category);
  }
  
  if (fields.length === 0) return getSnmpTemplateById(id);
  
  values.push(id);
  const [result] = await pool.query(`UPDATE snmp_templates SET ${fields.join(', ')} WHERE id = ? AND is_default = FALSE`, values);
  
  if (result.affectedRows === 0) return null;
  
  const [rows] = await pool.query('SELECT * FROM snmp_templates WHERE id = ?', [id]);
  return {
    ...rows[0],
    oidMappings: rows[0].oid_mappings,
    oidBase: rows[0].oid_base
  };
}

async function deleteSnmpTemplate(id) {
  const [result] = await pool.query(`DELETE FROM snmp_templates WHERE id = ? AND is_default = FALSE`, [id]);
  return result.affectedRows > 0;
}

// ==================== EQUIPMENT LOGS ====================

async function createEquipmentLog(data) {
  // For MySQL, we insert basic data and rely on JOINs for related info
  const [result] = await pool.query(`
    INSERT INTO equipment_logs (equipment_id, data, source)
    VALUES (?, ?, ?)
  `, [data.equipmentId, JSON.stringify(data.data), data.source || 'snmp']);
  return result;
}

async function getEquipmentLogs(filters = {}) {
  // MySQL compatible query - use basic columns from equipment_logs table
  // Additional equipment info will be fetched via JOIN
  // Simplified query to avoid complex column mapping issues
  
  let query = `
    SELECT 
      el.id,
      el.equipment_id,
      el.source,
      el.logged_at,
      el.data,
      e.name as equipment_name,
      e.code as equipment_code,
      a.name as airport_name,
      a.city as airport_city
    FROM equipment_logs el
    LEFT JOIN equipment e ON el.equipment_id = e.id
    LEFT JOIN airports a ON e.airport_id = a.id
    WHERE 1=1
  `;
  const values = [];
  
  if (filters.equipmentId) {
    query += ` AND el.equipment_id = ?`;
    values.push(filters.equipmentId);
  }
  if (filters.source) {
    query += ` AND el.source = ?`;
    values.push(filters.source);
  }
  if (filters.from) {
    query += ` AND el.logged_at >= ?`;
    values.push(filters.from);
  }
  if (filters.to) {
    query += ` AND el.logged_at <= ?`;
    values.push(filters.to);
  }
  // Note: status filter is handled in JavaScript after query
  // This avoids potential JSON function issues in MySQL

  try {
    // Count total records - use simpler count query
    const [countResult] = await pool.query('SELECT COUNT(*) as total FROM equipment_logs', []);
    const total = parseInt(countResult[0]?.total || 0);
    
    const page = Math.max(1, parseInt(filters.page) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(filters.limit) || 100));
    const offset = (page - 1) * limit;
    
    query += ` ORDER BY el.logged_at DESC LIMIT ? OFFSET ?`;
    values.push(limit, offset);
    
    const [rows] = await pool.query(query, values);
    
    // Process rows to format data for frontend
    const processedData = rows.map(row => {
      // Extract status from JSON data if available
      let status = 'Normal';
      let parsedData = row.data;
      
      try {
        if (row.data) {
          parsedData = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
          status = parsedData.status || 'Normal';
        }
      } catch (e) {
        // Ignore parsing errors, use default
        parsedData = {};
      }
      
      return {
        id: row.id,
        equipment_id: row.equipment_id,
        equipment_name: row.equipment_name || 'Unknown',
        equipment_code: row.equipment_code || '-',
        status: status,
        data: parsedData,
        logged_at: row.logged_at,
        airport_name: row.airport_name || 'Unknown',
        airport_city: row.airport_city || '-',
        source: row.source || 'snmp'
      };
    });
    
    return {
      data: processedData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error('[DB] Error in getEquipmentLogs:', error.message);
    // Return empty result instead of throwing error
    return {
      data: [],
      pagination: {
        page: parseInt(filters.page) || 1,
        limit: Math.min(1000, Math.max(1, parseInt(filters.limit) || 100)),
        total: 0,
        totalPages: 0
      }
    };
  }
}

async function getLatestEquipmentLog(equipmentId) {
  const [rows] = await pool.query(`
    SELECT * FROM equipment_logs 
    WHERE equipment_id = ? 
    ORDER BY logged_at DESC 
    LIMIT 1
  `, [equipmentId]);
  return rows[0] || null;
}

// ==================== CATEGORIES ====================

async function getAllCategories() {
  const [rows] = await pool.query('SELECT * FROM categories ORDER BY name');
  return rows;
}

// ==================== THRESHOLD SETTINGS ====================

async function getThresholdsByEquipment(equipmentId) {
  try {
    const [rows] = await pool.query(
      `SELECT et.*, e.name as equipment_name, e.code as equipment_code
       FROM equipment_thresholds et
       JOIN equipment e ON et.equipment_id = e.id
       WHERE et.equipment_id = ?
       ORDER BY et.parameter_name`,
      [equipmentId]
    );
    return rows;
  } catch (error) {
    console.error('[DB] Error getting thresholds:', error);
    throw error;
  }
}

async function createThreshold(data) {
  try {
    const [result] = await pool.query(
      `INSERT INTO equipment_thresholds 
       (equipment_id, parameter_name, oid_key, warning_low, warning_high, critical_low, critical_high, unit, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [
        data.equipment_id,
        data.parameter_name,
        data.oid_key,
        data.warning_low || null,
        data.warning_high || null,
        data.critical_low || null,
        data.critical_high || null,
        data.unit || null,
        data.is_active !== undefined ? data.is_active : true
      ]
    );
    
    const [rows] = await pool.query('SELECT * FROM equipment_thresholds WHERE id = ?', [result.insertId]);
    return rows[0];
  } catch (error) {
    console.error('[DB] Error creating threshold:', error);
    throw error;
  }
}

async function updateThreshold(thresholdId, data) {
  try {
    await pool.query(
      `UPDATE equipment_thresholds 
       SET parameter_name = ?, oid_key = ?, warning_low = ?, warning_high = ?, 
           critical_low = ?, critical_high = ?, unit = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        data.parameter_name,
        data.oid_key,
        data.warning_low || null,
        data.warning_high || null,
        data.critical_low || null,
        data.critical_high || null,
        data.unit || null,
        data.is_active !== undefined ? data.is_active : true,
        thresholdId
      ]
    );
    
    const [rows] = await pool.query('SELECT * FROM equipment_thresholds WHERE id = ?', [thresholdId]);
    return rows[0];
  } catch (error) {
    console.error('[DB] Error updating threshold:', error);
    throw error;
  }
}

async function deleteThreshold(thresholdId) {
  try {
    await pool.query('DELETE FROM equipment_thresholds WHERE id = ?', [thresholdId]);
    return true;
  } catch (error) {
    console.error('[DB] Error deleting threshold:', error);
    throw error;
  }
}

// ==================== SURVEILLANCE STATIONS ====================

async function getAllSurveillanceStations(filters = {}) {
  let query = `
    SELECT ss.*, a.name as airport_name
    FROM surveillance_stations ss
    LEFT JOIN airports a ON ss.airport_id = a.id
    WHERE 1=1
  `;
  const values = [];
  
  if (filters.type) {
    query += ` AND ss.type = ?`;
    values.push(filters.type);
  }
  if (filters.airportId) {
    query += ` AND ss.airport_id = ?`;
    values.push(filters.airportId);
  }
  if (filters.isActive !== undefined) {
    query += ` AND ss.is_active = ?`;
    values.push(filters.isActive);
  }
  
  query += ` ORDER BY ss.type, ss.name`;
  
  const [rows] = await pool.query(query, values);
  
  return rows.map(row => ({
    ...row,
    airportName: row.airport_name,
    airportId: row.airport_id,
    config: row.config
  }));
}

async function getSurveillanceStationById(id) {
  const [rows] = await pool.query(`
    SELECT ss.*, a.name as airport_name
    FROM surveillance_stations ss
    LEFT JOIN airports a ON ss.airport_id = a.id
    WHERE ss.id = ?
  `, [id]);
  
  if (!rows[0]) return null;
  
  return {
    ...rows[0],
    airportName: rows[0].airport_name,
    airportId: rows[0].airport_id,
    config: rows[0].config
  };
}

async function createSurveillanceStation(data) {
  const [result] = await pool.query(`
    INSERT INTO surveillance_stations (name, type, ip, port, multicast_ip, lat, lng, airport_id, config, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    data.name,
    data.type,
    data.ip,
    data.port,
    data.multicastIp || null,
    data.lat || null,
    data.lng || null,
    data.airportId || null,
    data.config ? JSON.stringify(data.config) : null,
    data.isActive !== undefined ? data.isActive : true
  ]);
  
  const [rows] = await pool.query('SELECT * FROM surveillance_stations WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function updateSurveillanceStation(id, data) {
  const fields = [];
  const values = [];
  
  if (data.name !== undefined) {
    fields.push(`name = ?`);
    values.push(data.name);
  }
  if (data.type !== undefined) {
    fields.push(`type = ?`);
    values.push(data.type);
  }
  if (data.ip !== undefined) {
    fields.push(`ip = ?`);
    values.push(data.ip);
  }
  if (data.port !== undefined) {
    fields.push(`port = ?`);
    values.push(data.port);
  }
  if (data.multicastIp !== undefined) {
    fields.push(`multicast_ip = ?`);
    values.push(data.multicastIp);
  }
  if (data.lat !== undefined) {
    fields.push(`lat = ?`);
    values.push(data.lat);
  }
  if (data.lng !== undefined) {
    fields.push(`lng = ?`);
    values.push(data.lng);
  }
  if (data.airportId !== undefined) {
    fields.push(`airport_id = ?`);
    values.push(data.airportId);
  }
  if (data.config !== undefined) {
    fields.push(`config = ?`);
    values.push(JSON.stringify(data.config));
  }
  if (data.isActive !== undefined) {
    fields.push(`is_active = ?`);
    values.push(data.isActive);
  }
  
  if (fields.length === 0) return getSurveillanceStationById(id);
  
  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);
  
  await pool.query(`UPDATE surveillance_stations SET ${fields.join(', ')} WHERE id = ?`, values);
  
  const [rows] = await pool.query('SELECT * FROM surveillance_stations WHERE id = ?', [id]);
  return rows[0];
}

async function deleteSurveillanceStation(id) {
  await pool.query('DELETE FROM surveillance_stations WHERE id = ?', [id]);
}

// ==================== RADAR TARGETS ====================

async function saveRadarTarget(data) {
  const [result] = await pool.query(`
    INSERT INTO radar_targets 
      (station_id, target_number, sac, sic, mode3_a, flight_level, latitude, longitude, callsign, target_address, time_of_day, raw_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    data.stationId,
    data.targetNumber || null,
    data.sac || null,
    data.sic || null,
    data.mode3A || null,
    data.flightLevel || null,
    data.latitude || null,
    data.longitude || null,
    data.callsign || null,
    data.targetAddress || null,
    data.timeOfDay || null,
    data.rawData ? JSON.stringify(data.rawData) : null
  ]);
  
  const [rows] = await pool.query('SELECT * FROM radar_targets WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function getRadarTargets(stationId, options = {}) {
  const limit = options.limit || 100;
  const since = options.since || new Date(Date.now() - 3600000);
  
  const [rows] = await pool.query(`
    SELECT rt.*, ss.name as station_name
    FROM radar_targets rt
    JOIN surveillance_stations ss ON rt.station_id = ss.id
    WHERE rt.station_id = ? AND rt.logged_at >= ?
    ORDER BY rt.logged_at DESC
    LIMIT ?
  `, [stationId, since, limit]);
  
  return rows;
}

// ==================== ADS-B AIRCRAFT ====================

async function saveAdsbAircraft(data) {
  const [existing] = await pool.query(`
    SELECT id FROM adsb_aircraft 
    WHERE icao24 = ? AND logged_at > NOW() - INTERVAL 5 MINUTE
    ORDER BY logged_at DESC LIMIT 1
  `, [data.icao24]);
  
  if (existing.length > 0) {
    await pool.query(`
      UPDATE adsb_aircraft 
      SET callsign = ?, latitude = ?, longitude = ?, altitude = ?,
          ground_speed = ?, heading = ?, vertical_rate = ?,
          station_id = ?, logged_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      data.callsign || null,
      data.latitude || null,
      data.longitude || null,
      data.altitude || null,
      data.groundSpeed || null,
      data.heading || null,
      data.verticalRate || null,
      data.stationId || null,
      existing[0].id
    ]);
    
    const [rows] = await pool.query('SELECT * FROM adsb_aircraft WHERE id = ?', [existing[0].id]);
    return rows[0];
  } else {
    const [result] = await pool.query(`
      INSERT INTO adsb_aircraft 
        (icao24, callsign, sac, sic, latitude, longitude, altitude, ground_speed, heading, vertical_rate, category, emitter_type, station_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.icao24,
      data.callsign || null,
      data.sac || null,
      data.sic || null,
      data.latitude || null,
      data.longitude || null,
      data.altitude || null,
      data.groundSpeed || null,
      data.heading || null,
      data.verticalRate || null,
      data.category || null,
      data.emitterType || null,
      data.stationId || null
    ]);
    
    const [rows] = await pool.query('SELECT * FROM adsb_aircraft WHERE id = ?', [result.insertId]);
    return rows[0];
  }
}

async function getAdsbAircraft(options = {}) {
  const limit = options.limit || 500;
  const since = options.since || new Date(Date.now() - 300000);
  
  const [rows] = await pool.query(`
    SELECT aa.*, ss.name as station_name
    FROM adsb_aircraft aa
    LEFT JOIN surveillance_stations ss ON aa.station_id = ss.id
    WHERE aa.logged_at >= ?
    ORDER BY aa.logged_at DESC
    LIMIT ?
  `, [since, limit]);
  
  return rows;
}

async function getAdsbAircraftByIcao(icao24) {
  const [rows] = await pool.query(`
    SELECT aa.*, ss.name as station_name
    FROM adsb_aircraft aa
    LEFT JOIN surveillance_stations ss ON aa.station_id = ss.id
    WHERE aa.icao24 = ? AND aa.logged_at > NOW() - INTERVAL 5 MINUTE
    ORDER BY aa.logged_at DESC
    LIMIT 1
  `, [icao24.toUpperCase()]);
  
  return rows[0] || null;
}

// ==================== SURVEILLANCE LOGS ====================

async function createSurveillanceLog(data) {
  const [result] = await pool.query(`
    INSERT INTO surveillance_logs (station_id, log_type, message, severity, data)
    VALUES (?, ?, ?, ?, ?)
  `, [
    data.stationId || null,
    data.logType,
    data.message || null,
    data.severity || 'info',
    data.data ? JSON.stringify(data.data) : null
  ]);
  
  const [rows] = await pool.query('SELECT * FROM surveillance_logs WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function getSurveillanceLogs(filters = {}) {
  let query = `
    SELECT sl.*, ss.name as station_name
    FROM surveillance_logs sl
    LEFT JOIN surveillance_stations ss ON sl.station_id = ss.id
    WHERE 1=1
  `;
  const values = [];
  
  if (filters.stationId) {
    query += ` AND sl.station_id = ?`;
    values.push(filters.stationId);
  }
  if (filters.logType) {
    query += ` AND sl.log_type = ?`;
    values.push(filters.logType);
  }
  if (filters.severity) {
    query += ` AND sl.severity = ?`;
    values.push(filters.severity);
  }
  if (filters.from) {
    query += ` AND sl.logged_at >= ?`;
    values.push(filters.from);
  }
  if (filters.to) {
    query += ` AND sl.logged_at <= ?`;
    values.push(filters.to);
  }
  
  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(1000, Math.max(1, parseInt(filters.limit) || 100));
  const offset = (page - 1) * limit;
  
  query += ` ORDER BY sl.logged_at DESC LIMIT ? OFFSET ?`;
  values.push(limit, offset);
  
  const [rows] = await pool.query(query, values);
  
  return {
    data: rows,
    pagination: { page, limit }
  };
}

module.exports = {
  // Airports
  getAllAirports,
  getAirportsPaginated,
  getAirportById,
  createAirport,
  updateAirport,
  deleteAirport,
  
  // Equipment
  getAllEquipment,
  getEquipmentStatsSummary,
  getEquipmentById,
  createEquipment,
  updateEquipment,
  updateEquipmentStatus,
  deleteEquipment,
  
  // Users
  getAllUsers,
  getUserById,
  findUserByUsername,
  createUser,
  updateUser,
  deleteUser,
  
  // SNMP Templates
  getAllSnmpTemplates,
  getSnmpTemplateById,
  createSnmpTemplate,
  updateSnmpTemplate,
  deleteSnmpTemplate,
  
  // Categories
  getAllCategories,
  
  // Equipment Logs
  createEquipmentLog,
  getEquipmentLogs,
  getLatestEquipmentLog,
  
  // Threshold Settings
  getThresholdsByEquipment,
  createThreshold,
  updateThreshold,
  deleteThreshold,
  
  // Surveillance Stations
  getAllSurveillanceStations,
  getSurveillanceStationById,
  createSurveillanceStation,
  updateSurveillanceStation,
  deleteSurveillanceStation,
  
  // Radar Targets
  saveRadarTarget,
  getRadarTargets,
  
  // ADS-B Aircraft
  saveAdsbAircraft,
  getAdsbAircraft,
  getAdsbAircraftByIcao,
  
  // Surveillance Logs
  createSurveillanceLog,
  getSurveillanceLogs,
  
  // Generic query function
  query,
  
  pool
};

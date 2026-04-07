const fs = require('fs');
const path = require('path');

// --- JSON CONFIG PATHS ---
const AIRPORT_CONFIG_PATH = path.join(__dirname, 'airport_config.json');
const EQUIPMENT_CONFIG_PATH = path.join(__dirname, 'equipment_config.json');
const USERS_CONFIG_PATH = path.join(__dirname, 'users_config.json');
const PARSING_CONFIG_PATH = path.join(__dirname, 'equipment_parsing_config.json');
const SUP_CATEGORY_PATH = path.join(__dirname, 'sup_category.json');
const AUTH_CONFIG_PATH = path.join(__dirname, 'equipment_otentication_config.json');
const LIMITATION_CONFIG_PATH = path.join(__dirname, 'limitation_config.json');
const TEMPLATE_CONFIG_PATH = path.join(__dirname, 'templates_config.json');

// --- GENERIC JSON HELPERS ---
function readJson(filePath, defaultValue = []) {
  try {
    if (!fs.existsSync(filePath)) {
      if (defaultValue !== null) writeJson(filePath, defaultValue);
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading JSON from ${filePath}:`, err);
    return defaultValue;
  }
}

function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing JSON to ${filePath}:`, err);
    return false;
  }
}

// --- AIRPORT CONFIG HELPERS ---
function readAirportConfig() {
  const data = readJson(AIRPORT_CONFIG_PATH, null);
  return data || {
    id: 1,
    name: 'Bandara Sentani',
    city: 'Jayapura',
    lat: -2.5768,
    lng: 140.5163,
    ipBranch: '172.19.16.1',
    status: 'Normal',
    totalEquipment: 3
  };
}

function writeAirportConfig(data) {
  return writeJson(AIRPORT_CONFIG_PATH, data);
}

// --- IN-MEMORY DATA (HISTORICAL/NON-PERSISTENT) ---
let equipmentLogsDB = [];
let surveillanceStationsDB = [];
let radarTargetsDB = [];
let adsbAircraftDB = [];
let surveillanceLogsDB = [];

// --- HELPER WRAPPER (DEPRECATED) ---
async function query(sql, params = []) {
  console.log('[JSON DB] MySQL query call ignored:', sql);
  return [];
}

// --- AIRPORTS ---
async function getAllAirports() {
  return [readAirportConfig()];
}

async function getAirportsPaginated(options = {}) {
  const airport = readAirportConfig();
  const { page = 1, limit = 20 } = options;
  return {
    data: [airport],
    pagination: { page, limit, total: 1, totalPages: 1 }
  };
}

async function getAirportById(id) {
  const airport = readAirportConfig();
  return airport.id == id ? airport : null;
}

async function createAirport(data) {
  console.log('[Airport] Create ignored - using single config mode');
  return readAirportConfig();
}

async function updateAirport(id, data) {
  const airport = readAirportConfig();
  if (airport.id == id) {
    const updated = { ...airport, ...data };
    writeAirportConfig(updated);
    return updated;
  }
  return null;
}

async function deleteAirport(id) {
  console.log('[Airport] Delete ignored - using single config mode');
}

// --- EQUIPMENT ---
async function getAllEquipment(filters = {}) {
  let equipmentList = readJson(EQUIPMENT_CONFIG_PATH);
  let filtered = [...equipmentList];

  if (filters.category) {
    filtered = filtered.filter(e => e.category === filters.category);
  }

  if (filters.airportId) {
    filtered = filtered.filter(e => e.airportId == filters.airportId);
  }

  if (filters.isActive !== undefined && filters.isActive !== 'all') {
    const activeFilter = (filters.isActive === true || filters.isActive === 'true');
    filtered = filtered.filter(e => (e.isActive === true || e.isActive === 'true') === activeFilter);
  }

  const page = filters.page || 1;
  const limit = filters.limit || 1000;
  const offset = (page - 1) * limit;

  return {
    data: filtered.slice(offset, offset + limit),
    total: filtered.length,
    pagination: { page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) }
  };
}

async function getEquipmentStatsSummary() {
  const equipmentList = readJson(EQUIPMENT_CONFIG_PATH);
  const stats = {
    total: equipmentList.length,
    statuses: [
      { status: 'Normal', count: equipmentList.filter(e => e.status === 'Normal').length },
      { status: 'Warning', count: equipmentList.filter(e => e.status === 'Warning').length },
      { status: 'Alert', count: equipmentList.filter(e => e.status === 'Alert').length },
      { status: 'Disconnect', count: equipmentList.filter(e => e.status === 'Disconnect').length }
    ],
    categories: [
      { category: 'Communication', count: equipmentList.filter(e => e.category === 'Communication').length },
      { category: 'Navigation', count: equipmentList.filter(e => e.category === 'Navigation').length },
      { category: 'Surveillance', count: equipmentList.filter(e => e.category === 'Surveillance').length },
      { category: 'Data Processing', count: equipmentList.filter(e => e.category === 'Data Processing').length },
      { category: 'Support', count: equipmentList.filter(e => e.category === 'Support').length }
    ]
  };
  return stats;
}

async function getEquipmentById(id) {
  const equipmentList = readJson(EQUIPMENT_CONFIG_PATH);
  return equipmentList.find(e => e.id == id) || null;
}

async function createEquipment(data) {
  let equipmentList = readJson(EQUIPMENT_CONFIG_PATH);
  const newEquip = {
    ...data,
    id: Number(data.id) || Date.now(),
    status: data.status || 'Normal',
    status_ops: data.status_ops || 'Normal',
    merk: data.merk || '-',
    type: data.type || '-',
    lat: parseFloat(data.lat) || 0,
    lng: parseFloat(data.lng) || 0,
    isActive: data.isActive !== undefined ? (data.isActive === true || data.isActive === 'true') : true
  };
  equipmentList.push(newEquip);
  writeJson(EQUIPMENT_CONFIG_PATH, equipmentList);
  return newEquip;
}

async function updateEquipment(id, data) {
  let equipmentList = readJson(EQUIPMENT_CONFIG_PATH);
  const index = equipmentList.findIndex(e => e.id == id);
  if (index !== -1) {
    const updated = {
      ...equipmentList[index],
      ...data,
      lat: data.lat !== undefined ? parseFloat(data.lat) : equipmentList[index].lat,
      lng: data.lng !== undefined ? parseFloat(data.lng) : equipmentList[index].lng,
      isActive: data.isActive !== undefined ? (data.isActive === true || data.isActive === 'true') : equipmentList[index].isActive
    };
    equipmentList[index] = updated;
    writeJson(EQUIPMENT_CONFIG_PATH, equipmentList);
    return updated;
  }
  return null;
}

async function updateEquipmentStatus(id, status) {
  let equipmentList = readJson(EQUIPMENT_CONFIG_PATH);
  const index = equipmentList.findIndex(e => e.id == id);
  if (index !== -1) {
    equipmentList[index].status = status;
    writeJson(EQUIPMENT_CONFIG_PATH, equipmentList);
  }
}

async function deleteEquipment(id) {
  let equipmentList = readJson(EQUIPMENT_CONFIG_PATH);
  const newList = equipmentList.filter(e => e.id != id);
  writeJson(EQUIPMENT_CONFIG_PATH, newList);
}

// --- EQUIPMENT PARSING CONFIGS (PREVIOUSLY SNMP TEMPLATES) ---
async function getAllParsingConfigs() {
  const configs = readJson(PARSING_CONFIG_PATH);
  return configs;
}

async function getParsingConfigById(id) {
  const configs = readJson(PARSING_CONFIG_PATH);
  return configs.find(c => c.id == id || c.name == id) || null;
}

async function createParsingConfig(data) {
  let configs = readJson(PARSING_CONFIG_PATH);
  const newCfg = {
    id: data.id || `custom_${Date.now()}`,
    name: data.name,
    category: data.category || '',
    files: data.files || '',
    createdAt: new Date().toISOString()
  };
  configs.push(newCfg);
  writeJson(PARSING_CONFIG_PATH, configs);
  return newCfg;
}

async function updateParsingConfig(id, data) {
  let configs = readJson(PARSING_CONFIG_PATH);
  const index = configs.findIndex(c => c.id == id);
  if (index !== -1) {
    configs[index] = { ...configs[index], ...data, updatedAt: new Date().toISOString() };
    writeJson(PARSING_CONFIG_PATH, configs);
    return configs[index];
  }
  return null;
}

async function deleteParsingConfig(id) {
  let configs = readJson(PARSING_CONFIG_PATH);
  const newList = configs.filter(c => c.id != id);
  writeJson(PARSING_CONFIG_PATH, newList);
  return true;
}

// --- SNMP TEMPLATES (FOR CONFIGURATION MENU) ---
async function getAllSnmpTemplates() {
  return readJson(TEMPLATE_CONFIG_PATH);
}

async function getSnmpTemplateById(id) {
  const templates = readJson(TEMPLATE_CONFIG_PATH);
  return templates.find(t => t.id == id) || null;
}

async function createSnmpTemplate(data) {
  let templates = readJson(TEMPLATE_CONFIG_PATH);
  const newTgl = {
    ...data,
    id: data.id || `custom_${Date.now()}`,
    createdAt: new Date().toISOString()
  };
  templates.push(newTgl);
  writeJson(TEMPLATE_CONFIG_PATH, templates);
  return newTgl;
}

async function updateSnmpTemplate(id, data) {
  let templates = readJson(TEMPLATE_CONFIG_PATH);
  const index = templates.findIndex(t => t.id == id);
  if (index !== -1) {
    templates[index] = { ...templates[index], ...data, updatedAt: new Date().toISOString() };
    writeJson(TEMPLATE_CONFIG_PATH, templates);
    return templates[index];
  }
  return null;
}

async function deleteSnmpTemplate(id) {
  let templates = readJson(TEMPLATE_CONFIG_PATH);
  const newList = templates.filter(t => t.id != id);
  writeJson(TEMPLATE_CONFIG_PATH, newList);
  return true;
}

// --- SUP CATEGORIES ---
async function getAllSupCategories() {
  return readJson(SUP_CATEGORY_PATH);
}

async function getSupCategoriesByCategory(category) {
  const data = readJson(SUP_CATEGORY_PATH);
  if (!category) return data;
  return data.find(c => c.category === category) || { category, sub_categories: [] };
}

async function createSupCategory(data) {
  let list = readJson(SUP_CATEGORY_PATH);
  const newItem = {
    id: Date.now(),
    category: data.category,
    sub_categories: data.sub_categories || []
  };
  list.push(newItem);
  writeJson(SUP_CATEGORY_PATH, list);
  return newItem;
}

async function deleteSupCategory(id) {
  let data = readJson(SUP_CATEGORY_PATH);
  // Support deletion by id or category name
  const newList = data.filter(c => c.id != id && c.category !== id);
  writeJson(SUP_CATEGORY_PATH, newList);
  return true;
}

async function updateSupCategory(category, subCategories) {
  let data = readJson(SUP_CATEGORY_PATH);
  const index = data.findIndex(c => c.category === category);
  if (index !== -1) {
    data[index].sub_categories = subCategories;
  } else {
    data.push({ category, sub_categories: subCategories });
  }
  writeJson(SUP_CATEGORY_PATH, data);
  return true;
}

// --- EQUIPMENT OTENTICATION (IP COMPONENTS) ---
async function getAllOtentication() {
  return readJson(AUTH_CONFIG_PATH);
}

async function getOtenticationByEquipment(equipmentId) {
  const data = readJson(AUTH_CONFIG_PATH);
  return data.filter(a => a.equipt_id == equipmentId);
}

async function createOtentication(data) {
  let authList = readJson(AUTH_CONFIG_PATH);
  const newItem = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    name: data.name,
    equipt_id: data.equipt_id || null,
    ip_address: data.ip_address
  };
  authList.push(newItem);
  writeJson(AUTH_CONFIG_PATH, authList);
  return newItem;
}

async function updateOtentication(id, data) {
  let list = readJson(AUTH_CONFIG_PATH);
  const index = list.findIndex(a => a.id == id);
  if (index !== -1) {
    list[index] = { ...list[index], ...data };
    writeJson(AUTH_CONFIG_PATH, list);
    return list[index];
  }
  return null;
}

async function deleteOtentication(id) {
  let list = readJson(AUTH_CONFIG_PATH);
  const newList = list.filter(a => a.id != id);
  writeJson(AUTH_CONFIG_PATH, newList);
}

async function deleteOtenticationByEquipment(equipmentId) {
  let authList = readJson(AUTH_CONFIG_PATH);
  const newList = authList.filter(a => a.equipt_id != equipmentId);
  writeJson(AUTH_CONFIG_PATH, newList);
}

// --- LIMITATION CONFIGS ---
async function getAllLimitations() {
  return readJson(LIMITATION_CONFIG_PATH);
}

async function getLimitationsByEquipment(equipmentId) {
  const equipment = await getEquipmentById(equipmentId);
  if (!equipment || !equipment.sup_category) return {};

  const data = readJson(LIMITATION_CONFIG_PATH);
  // Find limitation by sup_category instead of equipt_id
  return data.find(l => l.sup_category === equipment.sup_category) || {};
}

async function createLimitation(data) {
  console.log('[DB] createLimitation received data:', JSON.stringify(data, null, 2));
  let list = readJson(LIMITATION_CONFIG_PATH);
  const item = {
    id: Date.now(),
    name: data.name,
    category: data.category,
    sup_category: data.sup_category,
    value: data.value,
    value_type: data.value_type || 'numeric', // numeric, string, percent
    // New descriptive limit fields
    min_warning_limit: data.min_warning_limit,
    min_alarm_limit: data.min_alarm_limit,
    max_warning_limit: data.max_warning_limit,
    max_alarm_limit: data.max_alarm_limit,
    // Keep legacy for backward compatibility
    wlv: data.min_warning_limit || data.wlv,
    alv: data.min_alarm_limit || data.alv,
    whv: data.max_warning_limit || data.whv,
    ahv: data.max_alarm_limit || data.ahv,
    expected_value: data.expected_value || null
  };
  list.push(item);
  writeJson(LIMITATION_CONFIG_PATH, list);
  return item;
}

async function updateLimitation(id, data) {
  console.log(`[DB] updateLimitation received id: ${id}, data:`, JSON.stringify(data, null, 2));
  let list = readJson(LIMITATION_CONFIG_PATH);
  const index = list.findIndex(l => l.id == id || l.equipt_id == id);

  if (index !== -1) {
    // Clean up technical fields from frontend
    const { configType, configId, configMode, ...cleanData } = data;
    
    // Sync legacy fields if new ones are provided
    if (cleanData.min_warning_limit) cleanData.wlv = cleanData.min_warning_limit;
    if (cleanData.min_alarm_limit) cleanData.alv = cleanData.min_alarm_limit;
    if (cleanData.max_warning_limit) cleanData.whv = cleanData.max_warning_limit;
    if (cleanData.max_alarm_limit) cleanData.ahv = cleanData.max_alarm_limit;

    list[index] = { ...list[index], ...cleanData };
    writeJson(LIMITATION_CONFIG_PATH, list);
    return list[index];
  }
  return null;
}

async function deleteLimitation(id) {
  let list = readJson(LIMITATION_CONFIG_PATH);
  const newList = list.filter(l => l.id != id);
  writeJson(LIMITATION_CONFIG_PATH, newList);
}

// --- USERS ---
async function getAllUsers() {
  return readJson(USERS_CONFIG_PATH);
}

async function getUserByUsername(username) {
  const users = readJson(USERS_CONFIG_PATH);
  return users.find(u => u.username === username) || null;
}

async function getUserById(id) {
  const users = readJson(USERS_CONFIG_PATH);
  return users.find(u => u.id == id) || null;
}

async function createUser(data) {
  let users = readJson(USERS_CONFIG_PATH);
  const newUser = { ...data, id: Date.now() };
  users.push(newUser);
  writeJson(USERS_CONFIG_PATH, users);
  return newUser;
}

async function updateUser(id, data) {
  let users = readJson(USERS_CONFIG_PATH);
  const index = users.findIndex(u => u.id == id);
  if (index !== -1) {
    users[index] = { ...users[index], ...data, id: Number(id) };
    writeJson(USERS_CONFIG_PATH, users);
    return users[index];
  }
  return null;
}

async function deleteUser(id) {
  let users = readJson(USERS_CONFIG_PATH);
  const originalLength = users.length;
  users = users.filter(u => u.id != id);
  if (users.length < originalLength) {
    writeJson(USERS_CONFIG_PATH, users);
    return true;
  }
  return false;
}

// --- CATEGORIES ---
async function getAllCategories() {
  return ['Communication', 'Navigation', 'Surveillance', 'Data Processing', 'Support'];
}

// --- EQUIPMENT LOGS ---
async function createEquipmentLog(data) {
  const log = { ...data, id: Date.now(), logged_at: new Date().toISOString() };
  equipmentLogsDB.push(log);
  if (equipmentLogsDB.length > 1000) equipmentLogsDB.shift();
  return log;
}

async function getEquipmentLogs(filters = {}) {
  let filtered = [...equipmentLogsDB];
  if (filters.equipmentId) filtered = filtered.filter(l => l.equipmentId == filters.equipmentId);

  const page = filters.page || 1;
  const limit = filters.limit || 100;
  const offset = (page - 1) * limit;

  return {
    data: filtered.slice(offset, offset + limit),
    pagination: { page, limit }
  };
}

async function getLatestEquipmentLog(equipmentId) {
  const filtered = equipmentLogsDB.filter(l => l.equipmentId == equipmentId);
  return filtered[filtered.length - 1] || null;
}

// --- THRESHOLD SETTINGS ---
async function getThresholdsByEquipment(equipmentId) {
  return thresholdSettingsDB.filter(t => t.equipmentId == equipmentId);
}

async function createThreshold(data) {
  const t = { ...data, id: Date.now() };
  thresholdSettingsDB.push(t);
  return t;
}

async function updateThreshold(id, data) {
  const index = thresholdSettingsDB.findIndex(t => t.id == id);
  if (index !== -1) {
    thresholdSettingsDB[index] = { ...thresholdSettingsDB[index], ...data };
    return thresholdSettingsDB[index];
  }
  return null;
}

async function deleteThreshold(id) {
  thresholdSettingsDB = thresholdSettingsDB.filter(t => t.id != id);
}

module.exports = {
  query,
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
  // Parsing Configs
  getAllParsingConfigs,
  getParsingConfigById,
  createParsingConfig,
  updateParsingConfig,
  deleteParsingConfig,
  // Sup Categories
  getAllSupCategories,
  getSupCategoriesByCategory,
  createSupCategory,
  updateSupCategory,
  deleteSupCategory,
  // Equipment Otentication
  getAllOtentication,
  getOtenticationByEquipment,
  createOtentication,
  updateOtentication,
  deleteOtentication,
  deleteOtenticationByEquipment,
  // Limitation Configs
  getAllLimitations,
  getLimitationsByEquipment,
  createLimitation,
  updateLimitation,
  deleteLimitation,
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




  // Users
  getAllUsers,
  getUserByUsername,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  // SNMP Templates
  getAllSnmpTemplates,
  getSnmpTemplateById,
  createSnmpTemplate,
  updateSnmpTemplate,
  deleteSnmpTemplate
};

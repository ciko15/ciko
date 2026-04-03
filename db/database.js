const fs = require('fs');
const path = require('path');

// --- JSON CONFIG PATHS ---
const AIRPORT_CONFIG_PATH = path.join(__dirname, 'airport_config.json');
const EQUIPMENT_CONFIG_PATH = path.join(__dirname, 'equipment_config.json');
const USERS_CONFIG_PATH = path.join(__dirname, 'users_config.json');
const TEMPLATES_CONFIG_PATH = path.join(__dirname, 'templates_config.json');

// --- GENERIC JSON HELPERS ---
function readJson(filePath, defaultValue = []) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
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
let thresholdSettingsDB = [];
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
    id: Date.now(), 
    status: data.status || 'Normal',
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

// --- SNMP TEMPLATES ---
async function getAllSnmpTemplates() {
  const templates = readJson(TEMPLATES_CONFIG_PATH);
  return templates;
}

async function getSnmpTemplateById(id) {
  const templates = readJson(TEMPLATES_CONFIG_PATH);
  return templates.find(t => t.id == id || t.name == id) || null;
}

async function createSnmpTemplate(data) {
  let templates = readJson(TEMPLATES_CONFIG_PATH);
  const newTemp = { 
    id: data.id || `custom_${Date.now()}`,
    name: data.name,
    protocol: data.protocol || 'snmp',
    description: data.description || '',
    parameters: data.parameters || [],
    isDefault: data.isDefault || false,
    createdAt: new Date().toISOString()
  };
  templates.push(newTemp);
  writeJson(TEMPLATES_CONFIG_PATH, templates);
  return newTemp;
}

async function updateSnmpTemplate(id, data) {
  let templates = readJson(TEMPLATES_CONFIG_PATH);
  const index = templates.findIndex(t => t.id == id);
  if (index !== -1) {
    templates[index] = { ...templates[index], ...data, updatedAt: new Date().toISOString() };
    writeJson(TEMPLATES_CONFIG_PATH, templates);
    return templates[index];
  }
  return null;
}

async function deleteSnmpTemplate(id) {
  let templates = readJson(TEMPLATES_CONFIG_PATH);
  const newList = templates.filter(t => t.id != id);
  writeJson(TEMPLATES_CONFIG_PATH, newList);
  return true;
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

// --- SURVEILLANCE STATIONS ---
async function getAllSurveillanceStations(filters = {}) {
  return surveillanceStationsDB;
}

async function getSurveillanceStationById(id) {
  return surveillanceStationsDB.find(s => s.id == id) || null;
}

async function createSurveillanceStation(data) {
  const s = { ...data, id: Date.now() };
  surveillanceStationsDB.push(s);
  return s;
}

async function updateSurveillanceStation(id, data) {
  const index = surveillanceStationsDB.findIndex(s => s.id == id);
  if (index !== -1) {
    surveillanceStationsDB[index] = { ...surveillanceStationsDB[index], ...data };
    return surveillanceStationsDB[index];
  }
  return null;
}

async function deleteSurveillanceStation(id) {
  surveillanceStationsDB = surveillanceStationsDB.filter(s => s.id != id);
}

// --- RADAR & ADS-B ---
async function saveRadarTarget(data) { radarTargetsDB.push(data); return data; }
async function getRadarTargets() { return radarTargetsDB; }
async function saveAdsbAircraft(data) { adsbAircraftDB.push(data); return data; }
async function getAdsbAircraft() { return adsbAircraftDB; }
async function getAdsbAircraftByIcao(icao) { return adsbAircraftDB.find(a => a.icao == icao); }

// --- SURVEILLANCE LOGS ---
async function createSurveillanceLog(data) {
  surveillanceLogsDB.push({ ...data, id: Date.now(), logged_at: new Date().toISOString() });
}
async function getSurveillanceLogs(filters = {}) {
  return { data: surveillanceLogsDB, pagination: { page: 1, limit: 100 } };
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
  // Users
  getAllUsers,
  getUserByUsername,
  getUserById,
  createUser
};

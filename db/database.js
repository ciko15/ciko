const fs = require('fs');
const path = require('path');
const AIRPORT_CONFIG_PATH = path.join(__dirname, 'airport_config.json');

function readAirportConfig() {
  try {
    const data = fs.readFileSync(AIRPORT_CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading airport config:', err);
    return { 
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
}

function writeAirportConfig(data) {
  try {
    fs.writeFileSync(AIRPORT_CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing airport config:', err);
  }
}

// --- IN-MEMORY DATABASE REPLACEMENT ---
// This file replaces the MySQL dependency with static in-memory arrays.
// Changes are persistent as long as the server is running.

// airportsDB array is now replaced by airport_config.json

let equipmentDB = [
  { id: 101, name: 'DVOR Sentani', code: 'NAV-DVOR-001', category: 'Navigation', status: 'Normal', lat: -2.5768, lng: 140.5163, airportId: 1, isActive: true, snmpConfig: { enabled: false } },
  { id: 102, name: 'VHF Ground-to-Air', code: 'COM-VHF-001', category: 'Communication', status: 'Warning', lat: -2.5780, lng: 140.5180, airportId: 1, isActive: true, snmpConfig: { enabled: false } },
  { id: 103, name: 'Radar MSSR', code: 'SURV-MSSR-001', category: 'Surveillance', status: 'Normal', lat: -2.5750, lng: 140.5200, airportId: 1, isActive: true, snmpConfig: { enabled: false } }
];
let snmpTemplatesDB = [
  { id: 'dvor_maru_220', name: 'DVOR MARU 220', isDefault: true },
  { id: 'dme_maru_310_320', name: 'DME MARU 310/320', isDefault: true }
];
let equipmentLogsDB = [];
let thresholdSettingsDB = [];
let surveillanceStationsDB = [];
let radarTargetsDB = [];
let adsbAircraftDB = [];
let surveillanceLogsDB = [];

// --- HELPER WRAPPER ---
async function query(sql, params = []) {
  console.log('[In-Memory DB] Mock query call ignored:', sql);
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
  let filtered = [...equipmentDB];
  
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
  const stats = {
    total: equipmentDB.length,
    statuses: [
      { status: 'Normal', count: equipmentDB.filter(e => e.status === 'Normal').length },
      { status: 'Warning', count: equipmentDB.filter(e => e.status === 'Warning').length },
      { status: 'Alert', count: equipmentDB.filter(e => e.status === 'Alert').length },
      { status: 'Disconnect', count: equipmentDB.filter(e => e.status === 'Disconnect').length }
    ],
    categories: [
      { category: 'Communication', count: equipmentDB.filter(e => e.category === 'Communication').length },
      { category: 'Navigation', count: equipmentDB.filter(e => e.category === 'Navigation').length },
      { category: 'Surveillance', count: equipmentDB.filter(e => e.category === 'Surveillance').length },
      { category: 'Data Processing', count: equipmentDB.filter(e => e.category === 'Data Processing').length },
      { category: 'Support', count: equipmentDB.filter(e => e.category === 'Support').length }
    ]
  };
  return stats;
}

async function getEquipmentById(id) {
  return equipmentDB.find(e => e.id == id) || null;
}

async function createEquipment(data) {
  const newEquip = { 
    ...data, 
    id: Date.now(), 
    status: data.status || 'Normal',
    lat: parseFloat(data.lat) || 0,
    lng: parseFloat(data.lng) || 0,
    isActive: data.isActive !== undefined ? (data.isActive === true || data.isActive === 'true') : true
  };
  equipmentDB.push(newEquip);
  return newEquip;
}

async function updateEquipment(id, data) {
  const index = equipmentDB.findIndex(e => e.id == id);
  if (index !== -1) {
    const updated = { 
      ...equipmentDB[index], 
      ...data,
      lat: data.lat !== undefined ? parseFloat(data.lat) : equipmentDB[index].lat,
      lng: data.lng !== undefined ? parseFloat(data.lng) : equipmentDB[index].lng,
      isActive: data.isActive !== undefined ? (data.isActive === true || data.isActive === 'true') : equipmentDB[index].isActive
    };
    equipmentDB[index] = updated;
    return updated;
  }
  return null;
}

async function updateEquipmentStatus(id, status) {
  const index = equipmentDB.findIndex(e => e.id == id);
  if (index !== -1) {
    equipmentDB[index].status = status;
  }
}

async function deleteEquipment(id) {
  equipmentDB = equipmentDB.filter(e => e.id != id);
}

// --- SNMP TEMPLATES ---
async function getAllSnmpTemplates() {
  return snmpTemplatesDB;
}

async function getSnmpTemplateById(id) {
  return snmpTemplatesDB.find(t => t.id == id) || null;
}

async function createSnmpTemplate(data) {
  const newTemp = { ...data, id: data.id || `custom_${Date.now()}` };
  snmpTemplatesDB.push(newTemp);
  return newTemp;
}

async function updateSnmpTemplate(id, data) {
  const index = snmpTemplatesDB.findIndex(t => t.id == id);
  if (index !== -1) {
    snmpTemplatesDB[index] = { ...snmpTemplatesDB[index], ...data };
    return snmpTemplatesDB[index];
  }
  return null;
}

async function deleteSnmpTemplate(id) {
  snmpTemplatesDB = snmpTemplatesDB.filter(t => t.id != id);
  return true;
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
  getSurveillanceLogs
};

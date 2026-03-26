// Server with PostgreSQL Database Integration
const express = require('express');
const path = require('path');
const { exec } = require('child_process');

// Import database module
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory data for SNMP templates (will be loaded from DB)
let defaultSnmpTemplates = [];
let customSnmpTemplates = [];

// Load SNMP templates from database
async function loadSnmpTemplates() {
  try {
    const templates = await db.getAllSnmpTemplates();
    defaultSnmpTemplates = templates.filter(t => t.isDefault);
    customSnmpTemplates = templates.filter(t => !t.isDefault);
    console.log('[Server] Loaded SNMP templates:', defaultSnmpTemplates.length + customSnmpTemplates.length);
  } catch (err) {
    console.error('[Server] Error loading SNMP templates:', err.message);
    // Fallback to hardcoded templates if DB not available
    defaultSnmpTemplates = [
      { 
        id: 'moxa_ioThinx_4150', 
        name: 'MOXA ioThinx 4150', 
        description: 'Industrial I/O Controller',
        oidBase: '1.3.6.1.4.1.50000',
        isDefault: true,
        oidMappings: {
          'deviceName': { oid: '1.1.0', type: 'string', label: 'Device Name' },
          'firmware': { oid: '1.2.0', type: 'string', label: 'Firmware Version' },
          'uptime': { oid: '1.3.0', type: 'timeticks', label: 'System Uptime' },
          'digitalInput_1': { oid: '2.1.0', type: 'integer', label: 'Digital Input 1' },
          'digitalInput_2': { oid: '2.2.0', type: 'integer', label: 'Digital Input 2' },
          'digitalInput_3': { oid: '2.3.0', type: 'integer', label: 'Digital Input 3' },
          'analogInput_1': { oid: '3.1.0', type: 'integer', label: 'Analog Input 1' },
          'analogInput_1_value': { oid: '3.2.0', type: 'integer', label: 'Analog Input 1 Value' },
          'analogInput_1_unit': { oid: '3.3.0', type: 'string', label: 'Analog Input 1 Unit' },
          'relayOutput_1': { oid: '4.1.0', type: 'integer', label: 'Relay Output 1' },
          'relayOutput_1_status': { oid: '4.2.0', type: 'integer', label: 'Relay Output 1 Status' },
          'powerStatus': { oid: '5.1.1.0', type: 'integer', label: 'Power Status', warningThreshold: 0, criticalThreshold: 0 },
          'batteryStatus': { oid: '5.1.2.0', type: 'integer', label: 'Battery Status' },
          'temperature': { oid: '6.1.0', type: 'integer', label: 'Temperature', unit: '°C', warningThreshold: 35, criticalThreshold: 45 },
          'humidity': { oid: '6.2.0', type: 'integer', label: 'Humidity', unit: '%', warningLow: 30, warningHigh: 80, criticalLow: 20, criticalHigh: 90 },
          'alarmStatus': { oid: '6.3.0', type: 'integer', label: 'Alarm Status', warningThreshold: 1, criticalThreshold: 2 }
        }
      },
      { 
        id: 'generic_snmp', 
        name: 'Generic SNMP Device', 
        description: 'Standard SNMP device (RFC1213)',
        oidBase: '1.3.6.1.2.1',
        isDefault: true,
        oidMappings: {
          'sysDescr': { oid: '1.1.0', type: 'string', label: 'System Description' },
          'sysUpTime': { oid: '1.3.0', type: 'timeticks', label: 'System Uptime' },
          'sysContact': { oid: '1.4.0', type: 'string', label: 'System Contact' },
          'sysName': { oid: '1.5.0', type: 'string', label: 'System Name' },
          'sysLocation': { oid: '1.6.0', type: 'string', label: 'System Location' }
        }
      },
      { 
        id: 'radar_system', 
        name: 'Radar System', 
        description: 'Primary Surveillance Radar',
        oidBase: '1.3.6.1.4.1.99991',
        isDefault: true,
        oidMappings: {
          'radarStatus': { oid: '1.1.0', type: 'integer', label: 'Radar Status', warningThreshold: 1, criticalThreshold: 2 },
          'azimuth': { oid: '2.1.0', type: 'integer', label: 'Azimuth Angle', unit: 'degrees' },
          'range': { oid: '2.2.0', type: 'integer', label: 'Range', unit: 'NM' },
          'scanRate': { oid: '2.3.0', type: 'integer', label: 'Scan Rate', unit: 'RPM' },
          'powerOutput': { oid: '3.1.0', type: 'integer', label: 'Power Output', unit: 'kW', warningThreshold: 80, criticalThreshold: 90 },
          'coolingStatus': { oid: '3.2.0', type: 'integer', label: 'Cooling Status', warningThreshold: 1, criticalThreshold: 2 }
        }
      }
    ];
  }
}

function getAllSnmpTemplates() {
  return [...defaultSnmpTemplates, ...customSnmpTemplates];
}

function findSnmpTemplate(id) {
  return getAllSnmpTemplates().find(t => t.id === id);
}

let snmpDataCache = {};

function generateCaptcha() {
  const num1 = Math.floor(Math.random() * 10) + 1;
  const num2 = Math.floor(Math.random() * 10) + 1;
  return { question: `${num1} + ${num2} = ?`, answer: num1 + num2 };
}

// SNMP Functions
async function snmpGet(oid, host, port, community) {
  return new Promise((resolve, reject) => {
    const cmd = `snmpget -v2c -c ${community} ${host}:${port} ${oid}`;
    exec(cmd, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) { reject(error); return; }
      const match = stdout.match(/::[\w.-]+\s*=\s*(\w+):\s*(.*)/);
      if (match) {
        let value = match[2].trim();
        if (value.startsWith('"') && value.endsWith('"')) { value = value.slice(1, -1); }
        resolve({ oid: oid, value: value, type: match[1] });
      } else { resolve(null); }
    });
  });
}

async function snmpGetBulk(oids, host, port, community) {
  return new Promise((resolve, reject) => {
    const firstOid = oids[0];
    const parts = firstOid.split('.');
    const entIdx = parts.indexOf('4');
    const baseOid = parts.slice(0, entIdx + 3).join('.');
    
    const cmd = `snmpwalk -v2c -c ${community} ${host}:${port} ${baseOid}`;
    console.log('[SNMP] Executing:', cmd);
    
    exec(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        console.log('[SNMP] Error:', error.message);
        reject(error);
        return;
      }
      
      console.log('[SNMP] Raw output:', stdout.substring(0, 300));
      
      const results = [];
      const lines = stdout.split('\n').filter(line => line.trim() && !line.includes('No more variables'));
      
      for (const line of lines) {
        const match = line.match(/::([\w.-]+)\s*=\s*(\w+):\s*(.*)/);
        if (match) {
          let value = match[3].trim();
          if (value.startsWith('"') && value.endsWith('"')) { value = value.slice(1, -1); }
          
          const oidParts = match[1].split('.');
          let suffix = '';
          
          const ent50000Idx = oidParts.indexOf('50000');
          if (ent50000Idx !== -1 && ent50000Idx + 1 < oidParts.length) {
            suffix = oidParts.slice(ent50000Idx + 1).join('.');
          } else {
            const ent99991Idx = oidParts.indexOf('99991');
            if (ent99991Idx !== -1 && ent99991Idx + 1 < oidParts.length) {
              suffix = oidParts.slice(ent99991Idx + 1).join('.');
            } else {
              suffix = oidParts.slice(8).join('.');
            }
          }
          
          results.push({ oid: suffix, fullOid: match[1], value: value, type: match[2] });
        }
      }
      
      console.log('[SNMP] Parsed results:', JSON.stringify(results));
      resolve(results);
    });
  });
}

async function fetchSnmpData(equipment) {
  const { ip, port, community, templateId } = equipment.snmpConfig;
  const template = findSnmpTemplate(templateId);
  
  if (!template) { throw new Error('Template not found'); }
  
  const oids = [];
  const oidKeyMap = {};
  
  for (const [key, mapping] of Object.entries(template.oidMappings)) {
    const fullOid = `${template.oidBase}.${mapping.oid}`;
    oids.push(fullOid);
    oidKeyMap[fullOid] = { key, mapping };
  }
  
  const results = await snmpGetBulk(oids, ip, port, community);
  
  const data = {};
  
  for (const result of results) {
    for (const [fullOid, km] of Object.entries(oidKeyMap)) {
      const mapping = km.mapping;
      if (result.oid === mapping.oid || result.oid.endsWith('.' + mapping.oid)) {
        data[km.key] = {
          oid: result.fullOid,
          value: result.value,
          type: result.type,
          label: mapping.label || km.key,
          unit: mapping.unit || '',
          timestamp: new Date().toISOString()
        };
      }
    }
  }
  
  return data;
}

function determineStatus(data, templateId) {
  const template = findSnmpTemplate(templateId);
  const defaultThresholds = {
    temperature: { warning: 35, critical: 45 },
    humidity: { warningLow: 30, warningHigh: 80, criticalLow: 20, criticalHigh: 90 },
    alarmStatus: { warning: 1, critical: 2 }
  };
  
  let thresholds = defaultThresholds;
  if (template && template.oidMappings) {
    thresholds = {};
    for (const [key, mapping] of Object.entries(template.oidMappings)) {
      if (mapping.warningThreshold !== undefined || mapping.criticalThreshold !== undefined) {
        thresholds[key] = { warning: mapping.warningThreshold, critical: mapping.criticalThreshold };
      }
      if (mapping.warningLow !== undefined || mapping.warningHigh !== undefined) {
        thresholds[key] = { ...thresholds[key], warningLow: mapping.warningLow, warningHigh: mapping.warningHigh, criticalLow: mapping.criticalLow, criticalHigh: mapping.criticalHigh };
      }
    }
  }
  
  let status = 'Normal';
  for (const [key, valueObj] of Object.entries(data)) {
    if (!valueObj || !valueObj.value) continue;
    const value = parseFloat(valueObj.value);
    if (isNaN(value)) continue;
    const threshold = thresholds[key];
    if (!threshold) continue;
    if (threshold.warningLow !== undefined && threshold.warningHigh !== undefined) {
      if (value <= threshold.criticalLow || value >= threshold.criticalHigh) return 'Alert';
      if (value <= threshold.warningLow || value >= threshold.warningHigh) status = 'Warning';
    } else if (threshold.criticalThreshold !== undefined) {
      if (value >= threshold.criticalThreshold) return 'Alert';
      if (threshold.warningThreshold !== undefined && value >= threshold.warningThreshold) status = 'Warning';
    }
  }
  return status;
}

async function getAirportStatus(airportId) {
  try {
    const equipment = await db.getAllEquipment({ airportId });
    if (equipment.some(e => e.status === 'Alert')) return 'Alert';
    if (equipment.some(e => e.status === 'Warning')) return 'Warning';
    return 'Normal';
  } catch (err) {
    return 'Normal';
  }
}

async function getEquipmentCountByCategory(airportId) {
  try {
    const equipment = await db.getAllEquipment({ airportId });
    return {
      Communication: equipment.filter(e => e.category === 'Communication').length,
      Navigation: equipment.filter(e => e.category === 'Navigation').length,
      Surveillance: equipment.filter(e => e.category === 'Surveillance').length,
      'Data Processing': equipment.filter(e => e.category === 'Data Processing').length,
      Support: equipment.filter(e => e.category === 'Support').length
    };
  } catch (err) {
    return {};
  }
}

// ==================== API ROUTES ====================

// Airport Routes
app.get('/api/airports', async (req, res) => {
  try {
    const airports = await db.getAllAirports();
    const airportsWithStatus = await Promise.all(airports.map(async (airport) => ({
      ...airport,
      status: await getAirportStatus(airport.id),
      equipmentCount: await getEquipmentCountByCategory(airport.id),
      totalEquipment: airport.totalEquipment || 0
    })));
    res.json(airportsWithStatus);
  } catch (err) {
    console.error('[API] Error fetching airports:', err);
    res.status(500).json({ message: 'Failed to fetch airports', error: err.message });
  }
});

app.get('/api/airports/:id', async (req, res) => {
  try {
    const airport = await db.getAirportById(parseInt(req.params.id));
    if (!airport) { return res.status(404).json({ message: 'Airport not found' }); }
    res.json({ 
      ...airport, 
      status: await getAirportStatus(airport.id), 
      equipmentCount: await getEquipmentCountByCategory(airport.id)
    });
  } catch (err) {
    console.error('[API] Error fetching airport:', err);
    res.status(500).json({ message: 'Failed to fetch airport', error: err.message });
  }
});

app.post('/api/airports', async (req, res) => {
  try {
    const newAirport = await db.createAirport({
      name: req.body.name,
      city: req.body.city,
      lat: parseFloat(req.body.lat),
      lng: parseFloat(req.body.lng),
      parentId: req.body.parentId ? parseInt(req.body.parentId) : null
    });
    res.status(201).json(newAirport);
  } catch (err) {
    console.error('[API] Error creating airport:', err);
    res.status(500).json({ message: 'Failed to create airport', error: err.message });
  }
});

app.put('/api/airports/:id', async (req, res) => {
  try {
    // Build update data with proper handling for parentId
    const updateData = {
      name: req.body.name,
      city: req.body.city,
      lat: req.body.lat ? parseFloat(req.body.lat) : undefined,
      lng: req.body.lng ? parseFloat(req.body.lng) : undefined
    };
    
    // Handle parentId - check if property exists (including empty string and null)
    if (req.body.hasOwnProperty('parentId')) {
      // Convert empty string to null, otherwise parse as integer
      const parentIdValue = req.body.parentId === '' || req.body.parentId === null ? null : parseInt(req.body.parentId);
      // Also check if it's a valid number string
      updateData.parentId = isNaN(parentIdValue) ? null : parentIdValue;
    }
    
    const airport = await db.updateAirport(parseInt(req.params.id), updateData);
    if (!airport) { return res.status(404).json({ message: 'Airport not found' }); }
    res.json(airport);
  } catch (err) {
    console.error('[API] Error updating airport:', err);
    res.status(500).json({ message: 'Failed to update airport', error: err.message });
  }
});

app.delete('/api/airports/:id', async (req, res) => {
  try {
    await db.deleteAirport(parseInt(req.params.id));
    res.json({ message: 'Airport deleted' });
  } catch (err) {
    console.error('[API] Error deleting airport:', err);
    res.status(500).json({ message: 'Failed to delete airport', error: err.message });
  }
});

// Category Routes
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await db.getAllCategories();
    res.json(categories);
  } catch (err) {
    // Fallback categories if DB not available
    res.json([
      { id: 'Communication', name: 'Communication', icon: 'fa-tower-broadcast' },
      { id: 'Navigation', name: 'Navigation', icon: 'fa-compass' },
      { id: 'Surveillance', name: 'Surveillance', icon: 'fa-satellite-dish' },
      { id: 'Data Processing', name: 'Data Processing', icon: 'fa-server' },
      { id: 'Support', name: 'Support', icon: 'fa-bolt' }
    ]);
  }
});

// SNMP Template Routes
app.get('/api/snmp/templates', (req, res) => {
  res.json(getAllSnmpTemplates());
});

app.get('/api/snmp/templates/:id', (req, res) => {
  const template = findSnmpTemplate(req.params.id);
  if (!template) { return res.status(404).json({ message: 'Template not found' }); }
  res.json(template);
});

app.post('/api/snmp/templates', async (req, res) => {
  const { name, description, oidBase, oidMappings } = req.body;
  if (!name || !oidBase || !oidMappings) { 
    return res.status(400).json({ message: 'Name, OID Base, and OID Mappings are required' }); 
  }
  try {
    const id = 'custom_' + Date.now();
    const newTemplate = await db.createSnmpTemplate({ id, name, description: description || '', oidBase, oidMappings });
    customSnmpTemplates.push(newTemplate);
    res.status(201).json(newTemplate);
  } catch (err) {
    console.error('[API] Error creating template:', err);
    res.status(500).json({ message: 'Failed to create template', error: err.message });
  }
});

app.put('/api/snmp/templates/:id', async (req, res) => {
  try {
    const template = await db.updateSnmpTemplate(req.params.id, req.body);
    if (!template) { return res.status(404).json({ message: 'Custom template not found or cannot edit default templates' }); }
    res.json(template);
  } catch (err) {
    console.error('[API] Error updating template:', err);
    res.status(500).json({ message: 'Failed to update template', error: err.message });
  }
});

app.delete('/api/snmp/templates/:id', async (req, res) => {
  try {
    await db.deleteSnmpTemplate(req.params.id);
    res.json({ message: 'Template deleted' });
  } catch (err) {
    console.error('[API] Error deleting template:', err);
    res.status(500).json({ message: 'Failed to delete template', error: err.message });
  }
});

// SNMP Data Routes
app.get('/api/snmp/data/:equipmentId', async (req, res) => {
  const equipmentId = parseInt(req.params.equipmentId);
  
  try {
    const item = await db.getEquipmentById(equipmentId);
    
    if (!item || !item.snmpConfig || !item.snmpConfig.enabled) {
      return res.status(404).json({ message: 'SNMP not configured for this equipment' });
    }
    
    console.log('[SNMP] Fetching data for equipment:', item.name, item.snmpConfig);
    const data = await fetchSnmpData(item);
    console.log('[SNMP] Got data:', JSON.stringify(data));
    
    const status = determineStatus(data, item.snmpConfig.templateId);
    await db.updateEquipmentStatus(equipmentId, status);
    snmpDataCache[equipmentId] = data;
    
    res.json(data);
  } catch (error) {
    console.error('[SNMP] Error for equipment', equipmentId + ':', error.message);
    if (snmpDataCache[equipmentId]) {
      return res.json({ ...snmpDataCache[equipmentId], error: error.message, cached: true });
    }
    res.status(500).json({ message: 'Failed to fetch SNMP data', error: error.message });
  }
});

// Equipment Routes
app.get('/api/equipment', async (req, res) => {
  try {
    const { airportId, category } = req.query;
    // Use high limit (1000) to fetch all equipment without pagination issues
    const equipment = await db.getAllEquipment({ 
      airportId: airportId ? parseInt(airportId) : undefined,
      category: category || undefined,
      limit: 1000
    });
    res.json(equipment);
  } catch (err) {
    console.error('[API] Error fetching equipment:', err);
    res.status(500).json({ message: 'Failed to fetch equipment', error: err.message });
  }
});

app.get('/api/equipment/:id', async (req, res) => {
  try {
    const item = await db.getEquipmentById(parseInt(req.params.id));
    if (!item) { return res.status(404).json({ message: 'Equipment not found' }); }
    res.json(item);
  } catch (err) {
    console.error('[API] Error fetching equipment:', err);
    res.status(500).json({ message: 'Failed to fetch equipment', error: err.message });
  }
});

app.post('/api/equipment', async (req, res) => {
  try {
    const newEquipment = await db.createEquipment({
      name: req.body.name,
      code: req.body.code,
      category: req.body.category,
      status: req.body.status,
      airportId: parseInt(req.body.airportId),
      description: req.body.description || '',
      snmpConfig: req.body.snmpConfig || { enabled: false, ip: '', port: 161, community: 'public', templateId: '' },
      isActive: req.body.isActive !== undefined ? req.body.isActive : true
    });
    res.status(201).json(newEquipment);
  } catch (err) {
    console.error('[API] Error creating equipment:', err);
    res.status(500).json({ message: 'Failed to create equipment', error: err.message });
  }
});

app.put('/api/equipment/:id', async (req, res) => {
  try {
    // Add isActive to the update data if provided
    const updateData = { ...req.body };
    if (updateData.isActive === undefined) {
      // If not provided, preserve existing value - don't change it
      delete updateData.isActive;
    }
    const item = await db.updateEquipment(parseInt(req.params.id), updateData);
    if (!item) { return res.status(404).json({ message: 'Equipment not found' }); }
    res.json(item);
  } catch (err) {
    console.error('[API] Error updating equipment:', err);
    res.status(500).json({ message: 'Failed to update equipment', error: err.message });
  }
});

app.delete('/api/equipment/:id', async (req, res) => {
  try {
    await db.deleteEquipment(parseInt(req.params.id));
    res.json({ message: 'Equipment deleted' });
  } catch (err) {
    console.error('[API] Error deleting equipment:', err);
    res.status(500).json({ message: 'Failed to delete equipment', error: err.message });
  }
});

// Auth Routes
app.get('/api/auth/captcha', (req, res) => {
  const captcha = generateCaptcha();
  if (!global.captchaStore) global.captchaStore = {};
  const captchaId = Math.random().toString(36).substring(7);
  global.captchaStore[captchaId] = captcha.answer;
  res.json({ id: captchaId, question: captcha.question });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password, captchaId, captchaAnswer } = req.body;
  if (!captchaId || !captchaAnswer || global.captchaStore[captchaId] !== parseInt(captchaAnswer)) { 
    return res.status(401).json({ message: 'Invalid captcha' }); 
  }
  
  try {
    const user = await db.findUserByUsername(username);
    if (!user || user.password !== password) { 
      return res.status(401).json({ message: 'Invalid credentials' }); 
    }
    delete global.captchaStore[captchaId];
    res.json({ id: user.id, username: user.username, name: user.name, role: user.role, branchId: user.branch_id });
  } catch (err) {
    console.error('[API] Error during login:', err);
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

// User Routes
app.get('/api/users', async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json(users);
  } catch (err) {
    console.error('[API] Error fetching users:', err);
    res.status(500).json({ message: 'Failed to fetch users', error: err.message });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await db.getUserById(parseInt(req.params.id));
    if (!user) { return res.status(404).json({ message: 'User not found' }); }
    res.json(user);
  } catch (err) {
    console.error('[API] Error fetching user:', err);
    res.status(500).json({ message: 'Failed to fetch user', error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const newUser = await db.createUser({
      username: req.body.username,
      password: req.body.password,
      name: req.body.name,
      role: req.body.role
    });
    res.status(201).json(newUser);
  } catch (err) {
    console.error('[API] Error creating user:', err);
    res.status(500).json({ message: 'Failed to create user', error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const user = await db.updateUser(parseInt(req.params.id), req.body);
    if (!user) { return res.status(404).json({ message: 'User not found' }); }
    res.json(user);
  } catch (err) {
    console.error('[API] Error updating user:', err);
    res.status(500).json({ message: 'Failed to update user', error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await db.deleteUser(parseInt(req.params.id));
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('[API] Error deleting user:', err);
    res.status(500).json({ message: 'Failed to delete user', error: err.message });
  }
});

// Root route
app.get('/', (req, res) => { 
  res.sendFile(path.join(__dirname, 'public', 'index.html')); 
});

// Start server
app.listen(PORT, async () => { 
  console.log(`Server is running on http://localhost:${PORT}`);
  
  // Load SNMP templates from database
  await loadSnmpTemplates();
  console.log('[Server] Application initialized');
});


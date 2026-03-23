const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, param, query, validationResult } = require('express-validator');
const cors = require('cors');

// Import database functions
const db = require('./db/database');

// Import RCMS Parser and Equipment Service
const EquipmentService = require('./src/services/equipment');
const DataCollectorScheduler = require('./src/scheduler/collector');
const connectionManager = require('./src/connection/manager');
const thresholdEvaluator = require('./src/utils/thresholdEvaluator');
const connectionTester = require('./src/scheduler/test_connection');
const websocketServer = require('./src/websocket/server');
const templateService = require('./src/services/template');

// Import Surveillance Receivers (RADAR ASTERIX & ADS-B)
let RadarReceiver = null;
let AdsbReceiver = null;
let radarReceiver = null;
let adsbReceiver = null;

try {
  RadarReceiver = require('./Backend/parse/radar_receiver');
  AdsbReceiver = require('./Backend/parse/adsb_receiver');
  console.log('[SURVEILLANCE] Radar and ADS-B receiver modules loaded');
} catch (err) {
  console.warn('[SURVEILLANCE] Could not load receiver modules:', err.message);
}

const app = express();
const PORT = 3100;

// JWT Secret Key - Dalam production, gunakan environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

// Salt rounds for password hashing
const saltRounds = 10;

// In-memory cache for SNMP templates (loaded from DB once)
let snmpTemplatesCache = null;

// SNMP Data Cache
let snmpDataCache = {};

// Custom SNMP Data Storage (for manual data override)
let customSnmpData = {
  moxa_ioThinx_4150: null,
  radar_system: null,
  generic_snmp: null
};

// Generator untuk Captcha Login
function generateCaptcha() {
  const num1 = Math.floor(Math.random() * 10) + 1;
  const num2 = Math.floor(Math.random() * 10) + 1;
  return { question: `${num1} + ${num2} = ?`, answer: num1 + num2 };
}

// In-memory state untuk simulasi nilai realistis (Random Walk)
const simulationState = {};

// Simulation mode - generate fake data when SNMP device is unreachable
const SIMULATION_MODE = true;

// NEW: Generator for DVOR MARU 220 raw data (text-based)
function generateDvorMaruData(equipmentId) {
    const stateKey = `${equipmentId}_dvor`;
    if (!simulationState[stateKey]) {
        // Inisialisasi nilai realistis (dikali 10 karena parser akan membaginya dengan 10)
        simulationState[stateKey] = { 
            rf_level: 100,     // 10.0 W
            azimuth: 3590,     // 359.0 deg
            am_30hz: 300,      // 30.0 %
            fm_9960hz: 300,    // 30.0 %
            v5: 50,            // 5.0 V
            v15: 150,          // 15.0 V
            v48: 480,          // 48.0 V
            
            // N2 & G2 Parameters
            mon2_rf_level: 98,
            mon2_azimuth: 3585,
            mon2_am_30hz: 295,
            mon2_fm_9960hz: 305,
            tx2_v5: 51,
            tx2_v15: 148,
            tx2_v48: 482
        };
    }
    const state = simulationState[stateKey];

    // Simulate random walk for values
    state.rf_level += (Math.random() * 2 - 1);
    state.azimuth += (Math.random() * 2 - 1);
    if (state.azimuth > 3600) state.azimuth -= 3600; // Loop sudut azimuth
    if (state.azimuth < 0) state.azimuth += 3600;
    state.am_30hz += (Math.random() * 1 - 0.5);
    state.fm_9960hz += (Math.random() * 1 - 0.5);
    state.v5 += (Math.random() * 0.2 - 0.1);
    state.v15 += (Math.random() * 0.4 - 0.2);
    state.v48 += (Math.random() * 1 - 0.5);
    
    // Simulasi random walk N2 & G2
    state.mon2_rf_level += (Math.random() * 2 - 1);
    state.mon2_azimuth += (Math.random() * 2 - 1);
    if (state.mon2_azimuth > 3600) state.mon2_azimuth -= 3600;
    if (state.mon2_azimuth < 0) state.mon2_azimuth += 3600;
    state.mon2_am_30hz += (Math.random() * 1 - 0.5);
    state.mon2_fm_9960hz += (Math.random() * 1 - 0.5);
    state.tx2_v5 += (Math.random() * 0.2 - 0.1);
    state.tx2_v15 += (Math.random() * 0.4 - 0.2);
    state.tx2_v48 += (Math.random() * 1 - 0.5);

    // Build the raw string frame
    // N1 = Monitor 1 (RF, 30Hz, Azimuth, 9960Hz)
    const n1Frame = `\x01\x02N1S1=${Math.round(state.rf_level)}|S2=${Math.round(state.am_30hz)}|S3=${Math.round(state.azimuth)}|S4=${Math.round(state.fm_9960hz)}\x03`;
    
    // G1 = Transmitter 1 (Voltages & Status)
    const g1Frame = `\x01\x02G1S11=${Math.round(state.v5)}|S12=${Math.round(state.v15)}|S13=${Math.round(state.v48)}|S20=1\x03`;
    
    // N2 = Monitor 2
    const n2Frame = `\x01\x02N2S1=${Math.round(state.mon2_rf_level)}|S2=${Math.round(state.mon2_am_30hz)}|S3=${Math.round(state.mon2_azimuth)}|S4=${Math.round(state.mon2_fm_9960hz)}\x03`;
    
    // G2 = Transmitter 2
    const g2Frame = `\x01\x02G2S11=${Math.round(state.tx2_v5)}|S12=${Math.round(state.tx2_v15)}|S13=${Math.round(state.tx2_v48)}|S20=1\x03`;

    // LC = Local Control (System Mode: 1 = TX1 Main)
    const lcFrame = `\x01\x02LCS10=1\x03`;

    return n1Frame + g1Frame + n2Frame + g2Frame + lcFrame;
}

// NEW: Generator for DME MARU 310/320 raw data (ASCII-HEX)
function generateDmeMaruData(equipmentId) {
    const stateKey = `${equipmentId}_dme`;
    if (!simulationState[stateKey]) {
        // fwd_power (puluhan watt, cth: 950.0 W -> 9500)
        // reply_eff (persen, cth: 98%)
        // sys_delay (ratusan us, cth: 50.00 us -> 5000)
        // v5, v15, v48 tegangan (puluhan volt, cth: 150 = 15.0V)
        simulationState[stateKey] = { 
            fwd_power: 9500, 
            reply_eff: 98, 
            sys_delay: 5000,
            v5: 50,
            v15: 150,
            v48: 480
        };
    }
    const state = simulationState[stateKey];

    // Simulate random walk for values
    state.fwd_power += (Math.random() * 20 - 10); // in tenths of a watt
    state.reply_eff += (Math.random() * 0.4 - 0.2);
    state.sys_delay += (Math.random() * 10 - 5);
    state.v5 += (Math.random() * 0.2 - 0.1);
    state.v15 += (Math.random() * 0.4 - 0.2);
    state.v48 += (Math.random() * 1 - 0.5);

    // Batasi efisiensi agar masuk akal
    if (state.reply_eff > 100) state.reply_eff = 100;

    const payload = Buffer.alloc(0x7A, 0);
    // Tulis nilai ke buffer pada offset yang sesuai dengan dme_maru_310_320.js
    payload.writeUInt16BE(Math.round(state.sys_delay), 0x00); // m1_sys_delay
    payload.writeUInt16BE(Math.round(state.reply_eff), 0x10); // m1_reply_eff
    payload.writeUInt16BE(Math.round(state.fwd_power), 0x14); // m1_fwd_power
    
    // Simulasi offset data tegangan
    payload.writeUInt16BE(Math.round(state.v5), 0x20);  // 5V 
    payload.writeUInt16BE(Math.round(state.v15), 0x22); // 15V
    payload.writeUInt16BE(Math.round(state.v48), 0x24); // 48V
    
    // Ident "JPA" di offset 0x5E (94 desimal) sepanjang 3 byte
    payload.write('JPA', 0x5E, 3, 'ascii');

    const payloadHex = payload.toString('hex');

    // Header for the frame
    const header = Buffer.alloc(8);
    header[0] = 0x01; // Unit
    header[1] = 0x02; // Device
    header.writeUInt16BE(0x7A, 6); // Length
    const headerHex = header.toString('hex');

    return `\x01${headerHex}\x02${payloadHex}\x03`;
}

// Generate simulated SNMP data based on template
function generateSimulatedData(templateId, equipmentId = 'default') {
  // 1. Simulasi Anomali Jaringan (Disconnect/Timeout) -> Peluang 5% Error
  if (Math.random() > 0.95) {
    throw new Error('Simulated Timeout: Device is unreachable');
  }

  const timestamp = new Date().toISOString();
  const stateKey = `${equipmentId}_${templateId}`;
  if (!simulationState[stateKey]) {
    simulationState[stateKey] = {};
  }
  const state = simulationState[stateKey];

  // 2. Dynamic Template Simulation (Membaca konfigurasi cerdas dari DB)
  let template = snmpTemplatesCache?.find(t => t.id === templateId);
  
  if (template && (template.oidMappings || template.oid_mappings)) {
    let mappings = template.oidMappings || template.oid_mappings;
    
    // FIX: Parse string JSON kembali ke Object jika data dari MySQL terkirim sebagai teks
    if (typeof mappings === 'string') {
      try {
        mappings = JSON.parse(mappings);
      } catch (e) {
        mappings = {};
      }
    }
    const result = {};
    
    for (const [key, mapping] of Object.entries(mappings)) {
      let value;
      const type = (mapping.type || 'INTEGER').toUpperCase();
      
      if (type.includes('INT') || type === 'GAUGE32' || type === 'TIMETICKS') {
        // 3. Perubahan Nilai Realistis (Random Walk)
        if (state[key] !== undefined) {
          // Naik/turun perlahan (-2 sampai +2)
          let delta = (Math.random() * 4) - 2;
          value = state[key] + delta;
          
          // Mencegah nilai melampaui batas logika/hancur
          const max = mapping.criticalHigh || mapping.criticalThreshold || 100;
          const min = mapping.criticalLow || 0;
          if (value > max + 5) value -= 3;
          if (value < min - 5) value += 3;
        } else {
          // Nilai inisial saat pertama kali jalan
          if (mapping.warningLow && mapping.warningHigh) {
            value = (mapping.warningLow + mapping.warningHigh) / 2;
          } else if (mapping.warningThreshold) {
            value = mapping.warningThreshold - (Math.random() * 5);
          } else {
            value = Math.floor(Math.random() * 50) + 20;
          }
        }
        state[key] = value;
        value = String(Math.floor(value));
      } else {
        // Untuk tipe data String (Status/Nama)
        if (!state[key]) {
          state[key] = mapping.label === 'Operational Status' ? 'Online' : 
                       mapping.label === 'Device Name' ? 'Simulated-Device' : '1';
        }
        value = String(state[key]);
      }
      
      result[key] = {
        oid: `${template.oidBase}.${mapping.oid}`,
        value: value,
        type: type,
        label: mapping.label || key,
        unit: mapping.unit || '',
        timestamp
      };
    }
    return result;
  }

  // Fallback ke Hardcode lama (jika template baru tidak ditemukan) + Random Walk
  if (templateId === 'moxa_ioThinx_4150') {
    state.temp = (state.temp || 25) + (Math.random() * 2 - 1);
    state.hum = (state.hum || 50) + (Math.random() * 2 - 1);
    return {
      deviceName: { oid: '1.3.6.1.4.1.50000.1.1.0', value: 'ioThinx-PowerUnit-01', type: 'STRING', label: 'Device Name', unit: '', timestamp },
      firmware: { oid: '1.3.6.1.4.1.50000.1.2.0', value: 'FW-1.0.3', type: 'STRING', label: 'Firmware Version', unit: '', timestamp },
      uptime: { oid: '1.3.6.1.4.1.50000.1.3.0', value: String(86400 + Math.floor(Math.random() * 1000)), type: 'INTEGER', label: 'Uptime', unit: 'seconds', timestamp },
      digitalInput1: { oid: '1.3.6.1.4.1.50000.2.1.0', value: String(Math.floor(Math.random() * 5) + 1), type: 'INTEGER', label: 'Digital Input 1', unit: '', timestamp },
      temperature: { oid: '1.3.6.1.4.1.50000.6.1.0', value: String(Math.floor(state.temp)), type: 'INTEGER', label: 'Temperature', unit: '°C', timestamp },
      humidity: { oid: '1.3.6.1.4.1.50000.6.2.0', value: String(Math.floor(state.hum)), type: 'INTEGER', label: 'Humidity', unit: '%', timestamp },
      alarmStatus: { oid: '1.3.6.1.4.1.50000.6.3.0', value: '0', type: 'INTEGER', label: 'Alarm Status', unit: '', timestamp },
      powerStatus: { oid: '1.3.6.1.4.1.50000.5.1.1.0', value: '1', type: 'INTEGER', label: 'Power Status', unit: '', timestamp }
    };
  } else if (templateId === 'radar_system') {
    state.azimuth = ((state.azimuth || 0) + 12) % 360;
    return {
      systemStatus: { oid: '1.3.6.1.4.1.99991.1.1.0', value: '1', type: 'INTEGER', label: 'System Status', unit: '', timestamp },
      radarMode: { oid: '1.3.6.1.4.1.99991.1.2.0', value: '4', type: 'INTEGER', label: 'Radar Mode', unit: '', timestamp },
      operationalStatus: { oid: '1.3.6.1.4.1.99991.1.3.0', value: 'Online', type: 'STRING', label: 'Operational Status', unit: '', timestamp },
      azimuth: { oid: '1.3.6.1.4.1.99991.2.1.0', value: String(Math.floor(state.azimuth)), type: 'INTEGER', label: 'Azimuth', unit: 'degrees', timestamp },
      range: { oid: '1.3.6.1.4.1.99991.2.2.0', value: String(Math.floor(Math.random() * 150) + 50), type: 'INTEGER', label: 'Range', unit: 'NM', timestamp },
      power: { oid: '1.3.6.1.4.1.99991.5.1.0', value: String(-75 + Math.floor(Math.random() * 30)), type: 'INTEGER', label: 'Transmitter Power', unit: 'dBm', timestamp },
      fanStatus: { oid: '1.3.6.1.4.1.99991.6.2.0', value: '1', type: 'INTEGER', label: 'Fan Status', unit: '', timestamp }
    };
  } else if (templateId === 'ups_system') {
    state.volt = (state.volt || 220) + (Math.random() * 4 - 2);
    state.batt = (state.batt || 100) - (Math.random() * 0.5); // Baterai berkurang pelan
    if (state.batt < 80) state.batt = 100; // Reset ke 100% jika drop
    const upsStat = Math.random() > 0.1 ? 1 : 0; // 90% peluang Online, 10% Battery
    return {
      systemStatus: { oid: '1.3.6.1.4.1.99992.1.1.0', value: String(upsStat), type: 'INTEGER', label: 'UPS Status', unit: '', timestamp },
      inputVoltage: { oid: '1.3.6.1.4.1.99992.2.1.0', value: String(Math.floor(state.volt)), type: 'INTEGER', label: 'Input Voltage', unit: 'V', timestamp },
      batteryCapacity: { oid: '1.3.6.1.4.1.99992.3.1.0', value: String(Math.floor(state.batt)), type: 'INTEGER', label: 'Battery Capacity', unit: '%', timestamp },
      currentLoad: { oid: '1.3.6.1.4.1.99992.4.1.0', value: String(Math.floor(Math.random() * 20) + 40), type: 'INTEGER', label: 'Current Load', unit: '%', timestamp },
      temperature: { oid: '1.3.6.1.4.1.99992.5.1.0', value: String(Math.floor(Math.random() * 10) + 25), type: 'INTEGER', label: 'Battery Temperature', unit: '°C', timestamp }
    };
  }
  
  // Default simulated data
  return {
    status: { oid: '1.3.6.1.2.1.1.1.0', value: 'Normal', type: 'STRING', label: 'Status', unit: '', timestamp },
    value1: { oid: '1.3.6.1.2.1.1.2.0', value: String(Math.floor(Math.random() * 100)), type: 'INTEGER', label: 'Value 1', unit: '', timestamp },
    value2: { oid: '1.3.6.1.2.1.1.3.0', value: String(Math.floor(Math.random() * 50)), type: 'INTEGER', label: 'Value 2', unit: '', timestamp }
  };
}

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// Helmet untuk HTTP security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
      styleSrcElem: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      scriptSrcAttr: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org"],
      connectSrc: ["'self'", "https://unpkg.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: true,
  credentials: true
}));

// Rate limiting - mencegah brute force
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased from 100 to 1000 to prevent 429 errors during normal usage
  message: { message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many login attempts, please try again later.' }
});

// Middleware
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ping Routes (Continuous Ping Tool)
let pingInterval = null;
let pingResults = [];
let currentPingIp = null;
const MAX_PING_RESULTS = 100;

const ping = require('ping');

app.post('/api/ping/start', async (req, res) => {
    const { ip, interval } = req.body;
    
    if (!ip || !interval) {
        return res.status(400).json({ error: 'IP dan interval wajib diisi' });
    }
    
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) {
        return res.status(400).json({ error: 'Format IP tidak valid' });
    }
    
    if (interval < 1 || interval > 60) {
        return res.status(400).json({ error: 'Interval harus antara 1-60 detik' });
    }
    
    // Clear existing
    if (pingInterval) {
        clearInterval(pingInterval);
        pingResults = [];
    }
    
    currentPingIp = ip;
    const intervalMs = interval * 1000;
    
    // Initial ping
    try {
        const result = await ping.promise.probe(ip, { timeout: 5 });
        
        pingResults.push({
            time: new Date().toISOString(),
            alive: result.alive,
            responseTime: result.time,
            host: ip
        });
        
        // Start interval
        pingInterval = setInterval(async () => {
            try {
                const pResult = await ping.promise.probe(ip, { timeout: 5 });
                pingResults.push({
                    time: new Date().toISOString(),
                    alive: pResult.alive,
                    responseTime: pResult.time || 0,
                    host: ip
                });
                
                if (pingResults.length > MAX_PING_RESULTS) {
                    pingResults = pingResults.slice(-MAX_PING_RESULTS);
                }
                
                console.log(`[Ping] ${ip} - ${pResult.alive ? 'UP' : 'DOWN'} (${pResult.time}ms)`);
            } catch (e) {
                console.error('[Ping] Error:', e.message);
            }
        }, intervalMs);
        
        res.json({ 
            message: `Ping ke ${ip} setiap ${interval} detik dimulai`,
            ip: ip,
            interval: interval,
            status: result.alive ? 'online' : 'offline',
            responseTime: result.time
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/ping/stop', (req, res) => {
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
        
        const result = {
            message: 'Ping dihentikan',
            ip: currentPingIp,
            results: pingResults.length
        };
        
        currentPingIp = null;
        return res.json(result);
    }
    res.json({ message: 'Tidak ada ping aktif' });
});

app.get('/api/ping/status', (req, res) => {
    if (!currentPingIp || !pingInterval) {
        return res.json({ active: false, ip: null, results: [] });
    }
    
    res.json({
        active: true,
        ip: currentPingIp,
        results: pingResults,
        totalResults: pingResults.length
    });
});

app.get('/api/ping/results', (req, res) => {
    res.json({
        ip: currentPingIp,
        active: pingInterval !== null,
        results: pingResults
    });
});

// Apply rate limiting (skip heavy polling endpoints)
app.use('/api/', (req, res, next) => {
  // Allow high-frequency polling endpoints without rate limit
  if (req.path.startsWith('/sniffer') || req.path.startsWith('/network/')) {
    return next();
  }
  return limiter(req, res, next);
});

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
};

// ============================================
// INPUT VALIDATION
// ============================================

const validateInput = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Invalid input', errors: errors.array() });
  }
  next();
};

const isValidIP = (ip) => {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(ip)) return false;
  const parts = ip.split('.');
  return parts.every(part => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
};

const isValidOID = (oid) => {
  return /^[0-9.]+$/.test(oid);
};

async function snmpGetBulk(oids, host, port, community) {
  return new Promise((resolve, reject) => {
    if (!isValidIP(host)) {
      reject(new Error('Invalid host IP'));
      return;
    }
    
    const portNum = parseInt(port);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      reject(new Error('Invalid port'));
      return;
    }
    
    const safeHost = host.replace(/[^a-zA-Z0-9.-]/g, '');
    // Keep underscores in community string
    const safeCommunity = community.replace(/[^a-zA-Z0-9_]/g, '');
    
    const firstOid = oids[0];
    const parts = firstOid.split('.');
    const entIdx = parts.indexOf('4');
    const baseOid = parts.slice(0, entIdx + 3).join('.');
    
    const cmd = `snmpwalk -v2c -c ${safeCommunity} ${safeHost}:${portNum} ${baseOid}`;
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

async function fetchAndParseData(equipment) {
    const templateId = equipment.snmpConfig.templateId;
    const ipAddress = equipment.ipAddress || (equipment.snmpConfig ? equipment.snmpConfig.ip : null);

    // --- Konsep Pengecekan Gateway ---
    const airport = await db.getAirportById(equipment.airportId);
    if (!airport || !airport.ip_branch) {
        console.warn(`[DATA-COLLECT] No gateway for airport ${equipment.airportId}. Simulating disconnect for ${equipment.name}.`);
        throw new Error(`Gateway IP not configured for airport ${airport ? airport.name : 'Unknown'}`);
    }
    console.log(`[DATA-COLLECT] Connecting to ${equipment.name} (${ipAddress}) via Gateway ${airport.ip_branch}`);
    // --- Akhir Konsep Pengecekan ---

    let rawData;
    let parserType;

    // Memilih generator dan parser yang sesuai
    switch (templateId) {
        case 'dvor_maru_220':
            rawData = generateDvorMaruData(equipment.id);
            parserType = 'dvor_maru_220';
            break;
        case 'dme_maru_310_320':
            rawData = generateDmeMaruData(equipment.id);
            parserType = 'dme_maru_310_320';
            break;
        default:
            // Fallback ke simulasi SNMP yang sudah ada
            rawData = generateSimulatedData(templateId, equipment.id);
            // Data SNMP sudah "ter-parsing", jadi bisa langsung dikembalikan
            return { parsedData: rawData, status: await determineStatus(rawData, templateId) };
    }

    // Untuk DVOR & DME, kita perlu mem-parsing data mentah
    const ParserFactory = require('./src/parsers/factory');
    const parser = ParserFactory.createParser(parserType, {
        ...equipment,
        parser_config: {},
        threshold_overrides: {}
    });

    if (!parser) {
        throw new Error(`Parser tidak ditemukan untuk tipe '${parserType}'`);
    }

    const parsedResult = parser.parse(rawData);

    if (!parsedResult.success) {
        throw new Error(`Parsing gagal untuk ${equipment.name}: ${parsedResult.error}`);
    }

    // Menggunakan status dari hasil parsing
    return { parsedData: parsedResult.data, status: parsedResult.status };
}

async function determineStatus(data, templateId) {
  let template = snmpTemplatesCache?.find(t => t.id === templateId);
  if (!template && snmpTemplatesCache === null) {
    try {
      template = await db.getSnmpTemplateById(templateId);
    } catch (e) {
      template = null;
    }
  }

  // If template has parameters (new smart template), use parameter-based evaluation
  if (template && template.parameters && template.parameters.length > 0) {
    const parameterStatuses = {};
    let overallStatus = 'Normal';

    // Status priority order (highest to lowest)
    const statusPriority = { 'Alert': 3, 'Warning': 2, 'Normal': 1, 'Disconnect': 0 };

    for (const param of template.parameters) {
      const valueObj = data[param.source] || data[param.label];
      if (!valueObj || !valueObj.value) continue;

      const config = {
        warning_min: param.warning_min,
        warning_max: param.warning_max,
        alarm_min: param.alarm_min,
        alarm_max: param.alarm_max
      };

      const status = thresholdEvaluator.checkThreshold(valueObj.value, config);
      parameterStatuses[param.label] = status;

      // Update overall status if this parameter has higher priority
      if (statusPriority[status] > statusPriority[overallStatus]) {
        overallStatus = status;
      }
    }

    return overallStatus;
  }

  // Fallback to old template system
  const defaultThresholds = {
    temperature: { warning: 35, critical: 45 },
    humidity: { warningLow: 30, warningHigh: 80, criticalLow: 20, criticalHigh: 90 },
    alarmStatus: { warning: 1, critical: 2 }
  };

  let thresholds = defaultThresholds;
  if (template) {
    const oidMappings = template.oidMappings || template.oid_mappings;
    if (oidMappings) {
      thresholds = {};
      for (const [key, mapping] of Object.entries(oidMappings)) {
        if (mapping.warningThreshold !== undefined || mapping.criticalThreshold !== undefined) {
          thresholds[key] = { warning: mapping.warningThreshold, critical: mapping.criticalThreshold };
        }
        if (mapping.warningLow !== undefined || mapping.warningHigh !== undefined) {
          thresholds[key] = { ...thresholds[key], warningLow: mapping.warningLow, warningHigh: mapping.warningHigh, criticalLow: mapping.criticalLow, criticalHigh: mapping.criticalHigh };
        }
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

function getAirportStatus(airportId, equipmentList) {
  if (!equipmentList || equipmentList.length === 0) return 'Normal';
  if (equipmentList.some(e => e.status === 'Alert')) return 'Alert';
  if (equipmentList.some(e => e.status === 'Warning')) return 'Warning';
  if (equipmentList.some(e => e.status === 'Disconnect')) return 'Disconnect';
  return 'Normal';
}

function getEquipmentCountByCategory(equipmentList) {
  return {
    Communication: equipmentList?.filter(e => e.category === 'Communication').length || 0,
    Navigation: equipmentList?.filter(e => e.category === 'Navigation').length || 0,
    Surveillance: equipmentList?.filter(e => e.category === 'Surveillance').length || 0,
    'Data Processing': equipmentList?.filter(e => e.category === 'Data Processing').length || 0,
    Support: equipmentList?.filter(e => e.category === 'Support').length || 0
  };
}

// Initialize SNMP templates cache
async function initializeSnmpTemplates() {
  try {
    const templates = await db.getAllSnmpTemplates();
    
    // Inject default RCMS/Custom templates that might not be in DB
    const builtinTemplates = [
      { id: 'dvor_maru_220', name: 'DVOR MARU 220', description: 'DVOR MARU 220 (RCMS/Custom)', isDefault: true, oidBase: '-', oidMappings: {} },
      { id: 'dme_maru_310_320', name: 'DME MARU 310/320', description: 'DME MARU 310/320 (RCMS/Custom)', isDefault: true, oidBase: '-', oidMappings: {} }
    ];
    
    builtinTemplates.forEach(ht => {
      if (!templates.find(t => t.id === ht.id)) {
        templates.push(ht);
      }
    });
    
    snmpTemplatesCache = templates;
    console.log('[DB] SNMP Templates loaded:', templates.length);
  } catch (error) {
    console.error('[DB] Error loading SNMP templates:', error.message);
    snmpTemplatesCache = [];
  }
}

// ============================================
// PUBLIC API ROUTES (No Auth Required)
// ============================================

// Public endpoint for equipment statistics (no auth required)
app.get('/api/equipment/stats', async (req, res) => {
  try {
    // Gunakan query agregasi langsung dari MySQL (Performa Jauh Lebih Baik)
    const stats = await db.getEquipmentStatsSummary();
    
    // Format data status
    let normal = 0, warning = 0, alert = 0, disconnect = 0;
    if (stats && Array.isArray(stats.statuses)) {
      stats.statuses.forEach(row => {
        if (row.status === 'Normal') normal = parseInt(row.count);
        if (row.status === 'Warning') warning = parseInt(row.count);
        if (row.status === 'Alert') alert = parseInt(row.count);
        if (row.status === 'Disconnect') disconnect = parseInt(row.count);
      });
    }
    
    // Format data kategori dengan default 0
    const categories = {
      Communication: 0, Navigation: 0, Surveillance: 0, 'Data Processing': 0, Support: 0
    };
    if (stats && Array.isArray(stats.categories)) {
      stats.categories.forEach(row => {
        if (categories[row.category] !== undefined) {
          categories[row.category] = parseInt(row.count);
        }
      });
    }
    
    res.json({
      total: stats?.total || 0,
      normal,
      warning,
      alert,
      disconnect,
      byCategory: categories
    });
  } catch (error) {
    console.error('[API] Error fetching equipment stats:', error);
    // Berikan respons data default/kosong yang aman agar Dashboard Publik tetap hidup!
    res.json({
      total: 0, normal: 0, warning: 0, alert: 0, disconnect: 0,
      byCategory: { Communication: 0, Navigation: 0, Surveillance: 0, 'Data Processing': 0, Support: 0 }
    });
  }
});

app.get('/api/airports', async (req, res) => {
  try {
    const airports = await db.getAllAirports();
    
    // Get ALL equipment for counting (active and inactive)
    const allEquipment = await db.getAllEquipment({ limit: 10000, isActive: 'all' });
    const equipmentData = allEquipment.data || allEquipment;
    
    const airportsWithStatus = airports.map(airport => {
      const airportEquipment = equipmentData.filter(e => e.airportId === airport.id || e.branchId === airport.id);
      const activeEquipment = airportEquipment.filter(e => e.isActive === true || e.isActive === 'true' || e.is_active === 1 || e.is_active === '1');
      
      return {
        ...airport,
        status: getAirportStatus(airport.id, activeEquipment),
        equipmentCount: getEquipmentCountByCategory(airportEquipment),
        activeEquipmentCount: getEquipmentCountByCategory(activeEquipment),
        totalEquipment: airportEquipment.length,
        totalActiveEquipment: activeEquipment.length
      };
    });
    
    res.json(airportsWithStatus);
  } catch (error) {
    console.error('[API] Error fetching airports:', error);
    res.json([]); // Berikan array kosong agar Peta tidak crash
  }
});

app.get('/api/airports/:id', 
  param('id').isInt({ min: 1 }).withMessage('Invalid airport ID'),
  validateInput,
  async (req, res) => {
    try {
      const airport = await db.getAirportById(req.params.id);
      if (!airport) {
        return res.status(404).json({ message: 'Airport not found' });
      }
      
      // Get ALL equipment for accurate counting
      const allEquipment = await db.getAllEquipment({ limit: 10000, isActive: 'all' });
      const equipmentData = allEquipment.data || allEquipment;
      const airportEquipment = equipmentData.filter(e => e.airportId === airport.id || e.branchId === airport.id);
      const activeEquipment = airportEquipment.filter(e => e.isActive === true || e.isActive === 'true' || e.is_active === 1 || e.is_active === '1');
      
      res.json({
        ...airport,
        status: getAirportStatus(airport.id, activeEquipment),
        equipmentCount: getEquipmentCountByCategory(airportEquipment),
        activeEquipmentCount: getEquipmentCountByCategory(activeEquipment),
        totalEquipment: airportEquipment.length,
        totalActiveEquipment: activeEquipment.length
      });
    } catch (error) {
      console.error('[API] Error fetching airport:', error);
      res.status(500).json({ message: 'Error fetching airport' });
    }
  });


app.get('/api/categories', async (req, res) => {
  try {
    const categories = await db.getAllCategories();
    res.json(categories);
  } catch (error) {
    // Fallback to static categories
    res.json([
      { id: 'Communication', name: 'Communication', icon: 'fa-tower-broadcast' },
      { id: 'Navigation', name: 'Navigation', icon: 'fa-compass' },
      { id: 'Surveillance', name: 'Surveillance', icon: 'fa-satellite-dish' },
      { id: 'Data Processing', name: 'Data Processing', icon: 'fa-server' },
      { id: 'Support', name: 'Support', icon: 'fa-bolt' }
    ]);
  }
});

// Public endpoint for equipment details (no auth required - for detail panel)
app.get('/api/public/equipment/:id', async (req, res) => {
  try {
    const item = await db.getEquipmentById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Equipment not found' });
    }
    // Return limited public information
    res.json({
      id: item.id,
      name: item.name,
      code: item.code,
      category: item.category,
      status: item.status,
      airport_id: item.airport_id,
      created_at: item.created_at,
      updated_at: item.updated_at,
      snmp_config: item.snmp_config ? {
        ip: item.snmp_config.ip || null,
        type: item.snmp_config.type || null
      } : null
    });
  } catch (error) {
    console.error('[API] Error fetching equipment:', error);
    res.status(500).json({ message: 'Error fetching equipment' });
  }
});

// Public endpoint for equipment logs (no auth required - for detail panel)
app.get('/api/public/equipment/:id/logs', async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const result = await db.getEquipmentLogs({
      equipmentId: parseInt(req.params.id),
      page: 1,
      limit: parseInt(limit)
    });
    res.json(result);
  } catch (error) {
    console.error('[API] Error fetching equipment logs:', error);
    res.status(500).json({ message: 'Error fetching equipment logs' });
  }
});

// ============================================
// AUTH ROUTES (Rate Limited)
// ============================================

app.post('/api/auth/login', authLimiter, [
  body('username').trim().isLength({ min: 1, max: 50 }).withMessage('Username required'),
  body('password').isLength({ min: 1 }).withMessage('Password required'),
  body('captchaId').notEmpty().withMessage('Captcha ID required'),
  body('captchaAnswer').isInt().withMessage('Captcha answer required')
], validateInput, async (req, res) => {
  const { username, password, captchaId, captchaAnswer } = req.body;
  
  // Verify captcha
  if (!global.captchaStore || global.captchaStore[captchaId] !== parseInt(captchaAnswer)) {
    return res.status(401).json({ message: 'Invalid captcha' });
  }
  
  try {
    // Find user from database
    const user = await db.findUserByUsername(username);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, branchId: user.branch_id },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Clear captcha
    delete global.captchaStore[captchaId];
    
    res.json({ 
      token,
      id: user.id, 
      username: user.username, 
      name: user.name, 
      role: user.role, 
      branchId: user.branch_id 
    });
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    res.status(500).json({ message: 'Login error' });
  }
});

app.get('/api/auth/captcha', (req, res) => {
  const captcha = generateCaptcha();
  if (!global.captchaStore) global.captchaStore = {};
  const captchaId = Math.random().toString(36).substring(7);
  global.captchaStore[captchaId] = captcha.answer;
  res.json({ id: captchaId, question: captcha.question });
});

// ============================================
// PROTECTED API ROUTES (Authentication Required)
// ============================================

// Equipment routes with pagination
app.get('/api/equipment', authenticateToken, async (req, res) => {
  try {
    const { airportId, branchId, category, isActive, page = 1, limit = 1000 } = req.query;

    // Enforce branch scoping for branch users (cabang)
    // Admin and pusat users can optionally specify branchId/airportId to filter
    let effectiveBranchId;
    if (req.user && req.user.branchId) {
      effectiveBranchId = req.user.branchId;
    } else if (branchId) {
      effectiveBranchId = parseInt(branchId);
    } else if (airportId) {
      effectiveBranchId = parseInt(airportId);
    }

    const result = await db.getAllEquipment({
      branchId: effectiveBranchId,
      category: category || undefined,
      isActive: isActive === 'all' ? undefined : (isActive !== undefined ? isActive === 'true' : true), // Allow fetching all
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json(result);
  } catch (error) {
    console.error('[API] Error fetching equipment:', error);
    res.status(500).json({ message: 'Error fetching equipment' });
  }
});

// Equipment Logs routes - MUST be defined BEFORE /api/equipment/:id to avoid route conflict
app.get('/api/equipment/logs', authenticateToken, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('equipmentId').optional().isInt({ min: 1 }).withMessage('Equipment ID must be a positive integer'),
  query('source').optional().trim().isLength({ max: 50 }).withMessage('Source too long'),
  validateInput
], async (req, res) => {
  try {
    const { equipmentId, source, from, to, page = 1, limit = 100 } = req.query;

    const result = await db.getEquipmentLogs({
      equipmentId: equipmentId ? parseInt(equipmentId) : undefined,
      source: source || undefined,
      from: from || undefined,
      to: to || undefined,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json(result);
  } catch (error) {
    console.error('[API] Error fetching equipment logs:', error);
    res.status(500).json({ message: 'Error fetching equipment logs' });
  }
});

app.get('/api/equipment/:id', authenticateToken, 
  param('id').isInt({ min: 1 }).withMessage('Invalid equipment ID'),
  validateInput,
  async (req, res) => {
    try {
      const item = await db.getEquipmentById(req.params.id);
      if (!item) {
        return res.status(404).json({ message: 'Equipment not found' });
      }
      res.json(item);
    } catch (error) {
      console.error('[API] Error fetching equipment:', error);
      res.status(500).json({ message: 'Error fetching equipment' });
    }
});

app.post('/api/equipment', authenticateToken, authorize('admin', 'user_pusat', 'teknisi_cabang'), [
  body('name').trim().notEmpty().withMessage('Name required'),
  body('code').trim().notEmpty().withMessage('Code required'),
  body('category').isIn(['Communication', 'Navigation', 'Surveillance', 'Data Processing', 'Support']).withMessage('Invalid category'),
  body('branchId').optional().isInt({ min: 1 }).withMessage('Invalid branch ID'),
  body('airportId').optional().isInt({ min: 1 }).withMessage('Invalid airport ID')
], validateInput, async (req, res) => {
  try {
    // Determine branch context (branchId preferred, fallback to airportId)
    const branchId = req.body.branchId || req.body.airportId;
    if (!branchId) {
      return res.status(400).json({ message: 'Branch ID is required' });
    }

    // Ensure IP address is provided (from ipAddress or snmpConfig.ip)
    const ipAddress = req.body.ipAddress || (req.body.snmpConfig && req.body.snmpConfig.ip);
    if (!ipAddress || !ipAddress.toString().trim()) {
      return res.status(400).json({ message: 'IP address is required' });
    }

    const newEquipment = await db.createEquipment({
      name: req.body.name,
      code: req.body.code,
      category: req.body.category,
      status: req.body.status || 'Normal',
      airportId: req.body.airportId ? parseInt(req.body.airportId) : undefined,
      branchId: parseInt(branchId),
      description: req.body.description || '',
      snmpConfig: req.body.snmpConfig || { enabled: false, ip: '', port: 161, community: 'public', templateId: '' },
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      ipAddress: ipAddress
    });
    res.status(201).json(newEquipment);
  } catch (error) {
    console.error('[API] Error creating equipment:', error);
    res.status(500).json({ message: 'Error creating equipment' });
  }
});

app.put('/api/equipment/:id', authenticateToken, authorize('admin', 'user_pusat', 'teknisi_cabang'),
  param('id').isInt({ min: 1 }).withMessage('Invalid equipment ID'),
  body('branchId').optional().isInt({ min: 1 }).withMessage('Invalid branch ID'),
  body('airportId').optional().isInt({ min: 1 }).withMessage('Invalid airport ID'),
  validateInput,
  async (req, res) => {
    try {
      console.log('[API] Updating equipment:', req.params.id, req.body);

      // If branch is being updated, ensure at least one valid branch/origin is provided
      const branchId = req.body.branchId || req.body.airportId;
      if (branchId !== undefined && (branchId === null || branchId === '' || isNaN(parseInt(branchId)))) {
        return res.status(400).json({ message: 'Invalid branch ID' });
      }

      // If IP address is provided (or coming from snmp config), ensure it is not empty
      const ipAddress = req.body.ipAddress || (req.body.snmpConfig && req.body.snmpConfig.ip);
      if (req.body.hasOwnProperty('ipAddress') && (!ipAddress || !ipAddress.toString().trim())) {
        return res.status(400).json({ message: 'IP address cannot be empty' });
      }

      const updateData = {
        name: req.body.name,
        code: req.body.code,
        category: req.body.category,
        status: req.body.status,
        airportId: req.body.airportId ? parseInt(req.body.airportId) : undefined,
        branchId: branchId ? parseInt(branchId) : undefined,
        description: req.body.description,
        snmpConfig: req.body.snmpConfig,
        ipAddress: ipAddress
      };
      
      // Always include isActive if provided
      if (req.body.hasOwnProperty('isActive')) {
        updateData.isActive = req.body.isActive;
      }
      
      const updated = await db.updateEquipment(req.params.id, updateData);

      if (!updated) {
        return res.status(404).json({ message: 'Equipment not found' });
      }

      res.json(updated);
    } catch (error) {
      console.error('[API] Error updating equipment:', error);
      // Send more specific error message
      if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
        return res.status(400).json({ message: 'Equipment code already exists' });
      }
      res.status(500).json({ message: 'Error updating equipment', error: error.message });
    }
});

app.delete('/api/equipment/:id', authenticateToken, authorize('admin', 'user_pusat'),
  param('id').isInt({ min: 1 }).withMessage('Invalid equipment ID'),
  validateInput,
  async (req, res) => {
    try {
      await db.deleteEquipment(req.params.id);
      res.json({ message: 'Equipment deleted' });
    } catch (error) {
      console.error('[API] Error deleting equipment:', error);
      res.status(500).json({ message: 'Error deleting equipment' });
    }
});

// Ping endpoint - ping equipment IP
app.post('/api/equipment/ping', authenticateToken, [
  body('ip').trim().notEmpty().withMessage('IP address required'),
  validateInput
], async (req, res) => {
  try {
    const { ip } = req.body;
    
    // Validate IP format
    if (!isValidIP(ip)) {
      return res.status(400).json({ message: 'Invalid IP address format' });
    }
    
    console.log(`[PING] Standalone ping test for ${ip} using npm ping package...`);
    
    const ping = require('ping');
    
    try {
      const results = await Promise.all([
        ping.promise.probe(ip, { timeout: 3 }),
        ping.promise.probe(ip, { timeout: 3 }),
        ping.promise.probe(ip, { timeout: 3 }),
        ping.promise.probe(ip, { timeout: 3 })
      ]);
      
      const aliveCount = results.filter(r => r.alive).length;
      const rtts = results.map(r => r.time).filter(t => t > 0);
      
      let statistics = null;
      if (rtts.length > 0) {
        statistics = {
          min: Math.min(...rtts),
          max: Math.max(...rtts),
          avg: rtts.reduce((a, b) => a + b, 0) / rtts.length,
          packetLoss: ((4 - aliveCount) / 4 * 100).toFixed(1)
        };
      }
      
      const success = aliveCount > 0;
      
      res.json({
        success: success,
        ip: ip,
        status: success ? 'online' : 'offline',
        packets: {
          transmitted: 4,
          received: aliveCount,
          loss: statistics ? statistics.packetLoss + '%' : '100%'
        },
        statistics: statistics,
        timestamp: new Date().toISOString()
      });
    } catch (pingError) {
      console.error('[PING] npm ping error:', pingError.message);
      res.json({
        success: false,
        ip: ip,
        status: 'error',
        message: pingError.message,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('[PING] Error:', error);
    res.status(500).json({ message: 'Ping error', error: error.message });
  }
});

// Ping equipment by ID - use equipment's configured IP
app.get('/api/equipment/:id/ping', authenticateToken, 
  param('id').isInt({ min: 1 }).withMessage('Invalid equipment ID'),
  validateInput,
  async (req, res) => {
    try {
      const item = await db.getEquipmentById(req.params.id);
      if (!item) {
        return res.status(404).json({ message: 'Equipment not found' });
      }
      
      // Use dedicated ip_address column first, then fall back to snmp_config ip
      const config = item.snmpConfig || item.snmp_config;
      const ip = item.ip_address || (config && config.ip);
      
      // --- SKEMA GENERATOR / SIMULATOR AKTIF ---
      if (SIMULATION_MODE) {
        console.log(`[PING] Simulation mode active. Mocking ping for ${item.name}...`);
        const isAlive = Math.random() > 0.05; // 95% Chance berhasil (sesuai generator data SNMP)
        const mockRtt = Math.floor(Math.random() * 40) + 10;
        return res.json({
          success: isAlive,
          equipmentId: item.id,
          equipmentName: item.name,
          equipmentCode: item.code,
          ip: ip || 'simulated-ip',
          status: isAlive ? 'online' : 'offline',
          packets: { transmitted: 4, received: isAlive ? 4 : 0, loss: isAlive ? '0%' : '100%' },
          statistics: isAlive ? { min: mockRtt-2, max: mockRtt+5, avg: mockRtt, packetLoss: '0%' } : null,
          timestamp: new Date().toISOString()
        });
      }

      if (!ip || !isValidIP(ip)) {
        return res.status(400).json({ 
          message: 'Equipment does not have a valid IP configured',
          equipmentId: item.id,
          equipmentName: item.name,
          configuredIp: ip || 'not set'
        });
      }
      
      const ping = require('ping');
      
      // --- PING BERJENJANG (TIER 1: GATEWAY/BRANCH) ---
      const branchId = item.branchId || item.airport_id;
      if (branchId) {
         const branch = await db.getAirportById(branchId);
         if (branch && branch.ip_branch && isValidIP(branch.ip_branch)) {
            console.log(`[PING-TIER 1] Pinging Gateway ${branch.ip_branch} for branch ${branch.name}...`);
            const gwResult = await ping.promise.probe(branch.ip_branch, { timeout: 3 });
            
            if (!gwResult.alive) {
               console.log(`[PING-TIER 1] Gateway ${branch.ip_branch} UNREACHABLE. Aborting equipment ping.`);
               return res.json({
                  success: false,
                  equipmentId: item.id,
                  equipmentName: item.name,
                  ip: ip,
                  status: 'offline',
                  message: `Gateway Router Cabang (${branch.ip_branch}) terputus/mati. Ping ke alat dibatalkan.`,
                  timestamp: new Date().toISOString()
               });
            }
            console.log(`[PING-TIER 1] Gateway ALIVE. Proceeding to ping equipment...`);
         }
      }
      
      // --- PING BERJENJANG (TIER 2: EQUIPMENT ASLI) ---
      console.log(`[PING-TIER 2] Pinging equipment ${item.name} (${item.code}) at ${ip}...`);
      
      try {
        const results = await Promise.all([
          ping.promise.probe(ip, { timeout: 3 }),
          ping.promise.probe(ip, { timeout: 3 }),
          ping.promise.probe(ip, { timeout: 3 }),
          ping.promise.probe(ip, { timeout: 3 })
        ]);
        
        const aliveCount = results.filter(r => r.alive).length;
        const rtts = results.map(r => r.time).filter(t => t > 0);
        
        let statistics = null;
        if (rtts.length > 0) {
          statistics = {
            min: Math.min(...rtts),
            max: Math.max(...rtts),
            avg: rtts.reduce((a, b) => a + b, 0) / rtts.length,
            packetLoss: ((4 - aliveCount) / 4 * 100).toFixed(1)
          };
        }
        
        const success = aliveCount > 0;
        
        res.json({
          success: success,
          equipmentId: item.id,
          equipmentName: item.name,
          equipmentCode: item.code,
          ip: ip,
          status: success ? 'online' : 'offline',
          packets: {
            transmitted: 4,
            received: aliveCount,
            loss: statistics ? statistics.packetLoss + '%' : '100%'
          },
          statistics: statistics,
          timestamp: new Date().toISOString()
        });
      } catch (pingError) {
        console.error('[PING] npm ping error:', pingError.message);
        res.json({
          success: false,
          equipmentId: item.id,
          equipmentName: item.name,
          equipmentCode: item.code,
          ip: ip,
          status: 'error',
          message: pingError.message,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('[PING] Error:', error);
      res.status(500).json({ message: 'Ping error', error: error.message });
    }
  });

// SNMP routes
app.get('/api/snmp/templates', authenticateToken, async (req, res) => {
  try {
    const templates = await db.getAllSnmpTemplates();
    
    // Inject default RCMS/Custom templates that might not be in DB
    const builtinTemplates = [
      { id: 'dvor_maru_220', name: 'DVOR MARU 220', description: 'DVOR MARU 220 (RCMS/Custom)', isDefault: true, oidBase: '-', oidMappings: {} },
      { id: 'dme_maru_310_320', name: 'DME MARU 310/320', description: 'DME MARU 310/320 (RCMS/Custom)', isDefault: true, oidBase: '-', oidMappings: {} }
    ];
    
    builtinTemplates.forEach(ht => {
      if (!templates.find(t => t.id === ht.id)) {
        templates.push(ht);
      }
    });
    
    res.json(templates);
  } catch (error) {
    console.error('[API] Error fetching SNMP templates:', error);
    res.status(500).json({ message: 'Error fetching templates' });
  }
});

// Threshold Settings API Routes
// Get thresholds for a specific equipment
app.get('/api/equipment/:equipmentId/thresholds', authenticateToken, [
  param('equipmentId').isInt({ min: 1 }).withMessage('Invalid equipment ID'),
  validateInput
], async (req, res) => {
  try {
    const thresholds = await db.getThresholdsByEquipment(req.params.equipmentId);
    res.json(thresholds);
  } catch (error) {
    console.error('[API] Error fetching thresholds:', error);
    res.status(500).json({ message: 'Error fetching thresholds' });
  }
});

// Create new threshold for equipment
app.post('/api/equipment/:equipmentId/thresholds', authenticateToken, authorize('admin', 'user_pusat'), [
  param('equipmentId').isInt({ min: 1 }).withMessage('Invalid equipment ID'),
  body('parameter_name').trim().notEmpty().withMessage('Parameter name required'),
  body('oid_key').trim().notEmpty().withMessage('OID key required'),
  validateInput
], async (req, res) => {
  try {
    const threshold = await db.createThreshold({
      equipment_id: parseInt(req.params.equipmentId),
      parameter_name: req.body.parameter_name,
      oid_key: req.body.oid_key,
      warning_low: req.body.warning_low,
      warning_high: req.body.warning_high,
      critical_low: req.body.critical_low,
      critical_high: req.body.critical_high,
      unit: req.body.unit,
      is_active: req.body.is_active !== undefined ? req.body.is_active : true
    });
    res.status(201).json(threshold);
  } catch (error) {
    console.error('[API] Error creating threshold:', error);
    res.status(500).json({ message: 'Error creating threshold' });
  }
});

// Update existing threshold
app.put('/api/equipment/:equipmentId/thresholds/:thresholdId', authenticateToken, authorize('admin', 'user_pusat'), [
  param('equipmentId').isInt({ min: 1 }).withMessage('Invalid equipment ID'),
  param('thresholdId').isInt({ min: 1 }).withMessage('Invalid threshold ID'),
  body('parameter_name').trim().notEmpty().withMessage('Parameter name required'),
  body('oid_key').trim().notEmpty().withMessage('OID key required'),
  validateInput
], async (req, res) => {
  try {
    const threshold = await db.updateThreshold(req.params.thresholdId, {
      parameter_name: req.body.parameter_name,
      oid_key: req.body.oid_key,
      warning_low: req.body.warning_low,
      warning_high: req.body.warning_high,
      critical_low: req.body.critical_low,
      critical_high: req.body.critical_high,
      unit: req.body.unit,
      is_active: req.body.is_active
    });
    if (!threshold) {
      return res.status(404).json({ message: 'Threshold not found' });
    }
    res.json(threshold);
  } catch (error) {
    console.error('[API] Error updating threshold:', error);
    res.status(500).json({ message: 'Error updating threshold' });
  }
});

// Delete threshold
app.delete('/api/equipment/:equipmentId/thresholds/:thresholdId', authenticateToken, authorize('admin', 'user_pusat'), [
  param('equipmentId').isInt({ min: 1 }).withMessage('Invalid equipment ID'),
  param('thresholdId').isInt({ min: 1 }).withMessage('Invalid threshold ID'),
  validateInput
], async (req, res) => {
  try {
    await db.deleteThreshold(req.params.thresholdId);
    res.json({ message: 'Threshold deleted' });
  } catch (error) {
    console.error('[API] Error deleting threshold:', error);
    res.status(500).json({ message: 'Error deleting threshold' });
  }
});

app.get('/api/snmp/templates/:id', authenticateToken, 
  param('id').trim().notEmpty().withMessage('Template ID required'),
  validateInput,
  async (req, res) => {
    try {
      const template = await db.getSnmpTemplateById(req.params.id);
      if (!template) {
        return res.status(404).json({ message: 'Template not found' });
      }
      res.json(template);
    } catch (error) {
      console.error('[API] Error fetching SNMP template:', error);
      res.status(500).json({ message: 'Error fetching template' });
    }
});

app.post('/api/snmp/templates', authenticateToken, authorize('admin', 'user_pusat'), [
  body('name').trim().notEmpty().withMessage('Name required'),
  body('oidBase').trim().notEmpty().withMessage('OID Base required'),
  body('oidMappings').isObject().withMessage('OID Mappings required')
], validateInput, async (req, res) => {
  try {
    const { name, description, oidBase, oidMappings, category } = req.body;
    const id = 'custom_' + Date.now();
    const newTemplate = await db.createSnmpTemplate({
      id,
      name,
      description: description || '',
      oidBase,
      oidMappings,
      category: category || null,
      isDefault: false
    });
    
    // Refresh cache
    await initializeSnmpTemplates();
    
    res.status(201).json(newTemplate);
  } catch (error) {
    console.error('[API] Error creating SNMP template:', error);
    res.status(500).json({ message: 'Error creating template' });
  }
});

app.put('/api/snmp/templates/:id', authenticateToken, authorize('admin', 'user_pusat'),
  param('id').trim().notEmpty().withMessage('Template ID required'),
  validateInput,
  async (req, res) => {
    try {
      const { name, description, oidBase, oidMappings, category } = req.body;
      const updated = await db.updateSnmpTemplate(req.params.id, {
        name,
        description,
        oidBase,
        oidMappings,
        category
      });
      
      if (!updated) {
        return res.status(404).json({ message: 'Custom template not found or cannot edit default templates' });
      }
      
      // Refresh cache
      await initializeSnmpTemplates();
      
      res.json(updated);
    } catch (error) {
      console.error('[API] Error updating SNMP template:', error);
      res.status(500).json({ message: 'Error updating template' });
    }
});

app.delete('/api/snmp/templates/:id', authenticateToken, authorize('admin', 'user_pusat'),
  param('id').trim().notEmpty().withMessage('Template ID required'),
  validateInput,
  async (req, res) => {
    try {
      const deleted = await db.deleteSnmpTemplate(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: 'Custom template not found or cannot delete default templates' });
      }
      
      // Refresh cache
      await initializeSnmpTemplates();
      
      res.json({ message: 'Template deleted' });
    } catch (error) {
      console.error('[API] Error deleting SNMP template:', error);
      res.status(500).json({ message: 'Error deleting template' });
    }
});

// ============================================
// EQUIPMENT TEMPLATES API ROUTES (RCMS/DME/DVOR)
// ============================================

// Get all equipment templates
app.get('/api/templates', authenticateToken, async (req, res) => {
  try {
    const templates = await templateService.getAllTemplates();
    res.json(templates);
  } catch (error) {
    console.error('[API] Error fetching templates:', error);
    res.status(500).json({ message: 'Error fetching templates' });
  }
});

// Get template by ID
app.get('/api/templates/:id', authenticateToken, 
  param('id').isInt({ min: 1 }).withMessage('Invalid template ID'),
  validateInput,
  async (req, res) => {
    try {
      const template = await templateService.getTemplateById(req.params.id);
      if (!template) {
        return res.status(404).json({ message: 'Template not found' });
      }
      res.json(template);
    } catch (error) {
      console.error('[API] Error fetching template:', error);
      res.status(500).json({ message: 'Error fetching template' });
    }
});

// Create new equipment template
app.post('/api/templates', authenticateToken, authorize('admin', 'user_pusat'), [
  body('name').trim().notEmpty().withMessage('Name required'),
  body('equipment_type').isIn(['dme', 'dvor', 'snmp', 'radar', 'adsb']).withMessage('Invalid equipment type')
], validateInput, async (req, res) => {
  try {
    const template = await templateService.createTemplate(req.body);
    res.status(201).json(template);
  } catch (error) {
    console.error('[API] Error creating template:', error);
    res.status(500).json({ message: 'Error creating template' });
  }
});

// Update equipment template
app.put('/api/templates/:id', authenticateToken, authorize('admin', 'user_pusat'),
  param('id').isInt({ min: 1 }).withMessage('Invalid template ID'),
  validateInput,
  async (req, res) => {
    try {
      const template = await templateService.updateTemplate(req.params.id, req.body);
      if (!template) {
        return res.status(404).json({ message: 'Template not found or cannot edit system template' });
      }
      res.json(template);
    } catch (error) {
      console.error('[API] Error updating template:', error);
      res.status(500).json({ message: 'Error updating template' });
    }
});

// Delete equipment template
app.delete('/api/templates/:id', authenticateToken, authorize('admin'),
  param('id').isInt({ min: 1 }).withMessage('Invalid template ID'),
  validateInput,
  async (req, res) => {
    try {
      const deleted = await templateService.deleteTemplate(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: 'Template not found or cannot delete system template' });
      }
      res.json({ message: 'Template deleted' });
    } catch (error) {
      console.error('[API] Error deleting template:', error);
      res.status(500).json({ message: 'Error deleting template' });
    }
});

// ============================================
// PARSER TEST API ROUTES
// ============================================

// Test parser with sample data
app.post('/api/parser/test', authenticateToken, [
  body('connectionType').isIn(['json', 'rcms', 'snmp', 'tcp', 'udp']).withMessage('Invalid connection type'),
  body('parserConfig').isObject().withMessage('Parser config must be an object'),
  body('sampleData').notEmpty().withMessage('Sample data required')
], validateInput, async (req, res) => {
  try {
    const { connectionType, parserConfig, sampleData } = req.body;

    // Create parser instance
    const ParserFactory = require('./src/parsers/factory');
    const config = {
      parser_config: parserConfig,
      threshold_overrides: {}
    };

    const parser = ParserFactory.createParser(connectionType, config);
    if (!parser) {
      return res.status(400).json({ message: `Unsupported connection type: ${connectionType}` });
    }

    // Parse the sample data
    const result = parser.parse(sampleData);

    // Get last parsed data for change detection demo
    const equipmentService = require('./src/services/equipment');
    const equipmentId = req.body.equipmentId; // Optional
    let changes = {};

    if (equipmentId) {
      const lastParsed = await equipmentService.getLastParsedLog(equipmentId);
      if (lastParsed) {
        changes = equipmentService.computeParsedChanges(lastParsed.data || {}, result.data || {});
      }
    }

    res.json({
      success: true,
      parsed: result,
      changes: changes,
      hasChanges: Object.keys(changes).length > 0
    });

  } catch (error) {
    console.error('[API] Parser test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      parsed: null,
      changes: {}
    });
  }
});

// Get equipment logs with filtering
app.get('/api/equipment/:id/logs', authenticateToken,
  param('id').isInt({ min: 1 }).withMessage('Invalid equipment ID'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be 1-1000'),
  query('quality').optional().isIn(['valid', 'filtered', 'error']).withMessage('Invalid quality filter'),
  query('threshold').optional().isBoolean().withMessage('Threshold must be boolean'),
  validateInput,
  async (req, res) => {
  try {
    const equipmentId = req.params.id;
    const limit = parseInt(req.query.limit) || 100;
    const quality = req.query.quality;
    const thresholdApplied = req.query.threshold;

    let query = `
      SELECT el.*, e.name as equipment_name, e.code as equipment_code,
             a.name as airport_name, a.city as airport_city
      FROM equipment_logs el
      LEFT JOIN equipment e ON el.equipment_id = e.id
      LEFT JOIN airports a ON e.airport_id = a.id
      WHERE el.equipment_id = ?
    `;
    const params = [equipmentId];

    if (quality) {
      query += ' AND el.data_quality = ?';
      params.push(quality);
    }

    if (thresholdApplied !== undefined) {
      query += ' AND el.threshold_applied = ?';
      params.push(thresholdApplied === 'true');
    }

    query += ' ORDER BY el.logged_at DESC LIMIT ?';
    params.push(limit);

    const logs = await db.query(query, params);

    // Parse JSON fields
    const processedLogs = logs.map(log => ({
      ...log,
      data: typeof log.data === 'string' ? JSON.parse(log.data) : log.data,
      parsed_data: typeof log.parsed_data === 'string' ? JSON.parse(log.parsed_data) : log.parsed_data,
      changes: typeof log.changes === 'string' ? JSON.parse(log.changes) : log.changes
    }));

    res.json({
      equipmentId,
      logs: processedLogs,
      total: processedLogs.length,
      filters: { quality, thresholdApplied, limit }
    });

  } catch (error) {
    console.error('[API] Error fetching equipment logs:', error);
    res.status(500).json({ message: 'Error fetching logs' });
  }
});

app.get('/api/snmp/data/:equipmentId', authenticateToken,
  param('equipmentId').isInt({ min: 1 }).withMessage('Invalid equipment ID'),
  validateInput,
  async (req, res) => {
    try {
      const item = await db.getEquipmentById(req.params.equipmentId);
      
      if (!item || !item.snmpConfig || !item.snmpConfig.enabled) {
        return res.status(404).json({ message: 'SNMP not configured for this equipment' });
      }
      
      console.log('[SNMP] Fetching data for equipment:', item.name, item.snmpConfig);
      const { parsedData: data, status } = await fetchAndParseData(item);
      console.log('[SNMP] Got data:', JSON.stringify(data));
      
      // Catatan: Fungsi save ke Database DIHAPUS dari endpoint ini untuk mencegah spam.
      // Penyimpanan data dan status tetap berjalan setiap 1 menit 
      // melalui fungsi collectEquipmentData() (Scheduler Background).
      
      snmpDataCache[item.id] = data;
      
      res.json(data);
    } catch (error) {
      console.error('[SNMP] Error for equipment', req.params.equipmentId + ':', error.message);
      if (snmpDataCache[req.params.equipmentId]) {
        return res.json({ ...snmpDataCache[req.params.equipmentId], error: error.message, cached: true });
      }
      res.status(500).json({ message: 'Failed to fetch SNMP data', error: error.message });
    }
});

// ============================================
// SNMP TOOLS API ROUTES
// ============================================

// Test SNMP Connection
app.post('/api/snmp/test', authenticateToken, [
  body('ip').trim().notEmpty().withMessage('IP address required'),
  body('port').optional().isInt({ min: 1, max: 65535 }).withMessage('Invalid port'),
  body('community').optional().trim(),
  body('oid').optional().trim()
], validateInput, async (req, res) => {
  try {
    const { ip, port, community, oid } = req.body;
    
    if (!isValidIP(ip)) {
      return res.status(400).json({ message: 'Invalid IP address' });
    }
    
    const targetPort = parseInt(port) || 161;
    const targetCommunity = community || 'public';
    const targetOid = oid || '1.3.6.1.2.1.1.1.0';
    
    console.log(`[SNMP-TEST] Testing ${ip}:${targetPort} with OID ${targetOid}`);
    
    const result = await snmpGet(targetOid, ip, targetPort, targetCommunity);
    
    if (result) {
      res.json({
        success: true,
        ip: ip,
        port: targetPort,
        oid: targetOid,
        value: result.value,
        type: result.type
      });
    } else {
      res.status(404).json({ message: 'No SNMP response received' });
    }
  } catch (error) {
    console.error('[SNMP-TEST] Error:', error.message);
    res.status(500).json({ message: 'SNMP test failed', error: error.message });
  }
});

// Walk SNMP Tree
app.post('/api/snmp/walk', authenticateToken, [
  body('ip').trim().notEmpty().withMessage('IP address required'),
  body('port').optional().isInt({ min: 1, max: 65535 }).withMessage('Invalid port'),
  body('community').optional().trim(),
  body('oid').optional().trim()
], validateInput, async (req, res) => {
  try {
    const { ip, port, community, oid } = req.body;
    
    if (!isValidIP(ip)) {
      return res.status(400).json({ message: 'Invalid IP address' });
    }
    
    const targetPort = parseInt(port) || 161;
    const targetCommunity = community || 'public';
    const baseOid = oid || '1.3.6.1';
    
    console.log(`[SNMP-WALK] Walking ${ip}:${targetPort} from OID ${baseOid}`);
    
    // Use snmpGetBulk which actually does snmpwalk
    const results = await snmpGetBulk([baseOid], ip, targetPort, targetCommunity);
    
    res.json({
      success: true,
      ip: ip,
      port: targetPort,
      baseOid: baseOid,
      results: results
    });
  } catch (error) {
    console.error('[SNMP-WALK] Error:', error.message);
    res.status(500).json({ message: 'SNMP walk failed', error: error.message });
  }
});

// Bulk Get SNMP Data
app.post('/api/snmp/bulk', authenticateToken, [
  body('ip').trim().notEmpty().withMessage('IP address required'),
  body('port').optional().isInt({ min: 1, max: 65535 }).withMessage('Invalid port'),
  body('community').optional().trim()
], validateInput, async (req, res) => {
  try {
    const { ip, port, community } = req.body;
    
    if (!isValidIP(ip)) {
      return res.status(400).json({ message: 'Invalid IP address' });
    }
    
    const targetPort = parseInt(port) || 161;
    const targetCommunity = community || 'public';
    
    console.log(`[SNMP-BULK] Getting bulk data from ${ip}:${targetPort}`);
    
    // Common OIDs to fetch
    const commonOids = [
      '1.3.6.1.2.1.1.1.0',  // sysDescr
      '1.3.6.1.2.1.1.2.0',  // sysObjectID
      '1.3.6.1.2.1.1.3.0',  // sysUpTime
      '1.3.6.1.2.1.1.4.0',  // sysContact
      '1.3.6.1.2.1.1.5.0',  // sysName
      '1.3.6.1.2.1.1.6.0',  // sysLocation
      '1.3.6.1.2.1.1.7.0'    // sysServices
    ];
    
    const results = await snmpGetBulk(commonOids, ip, targetPort, targetCommunity);
    
    // Convert array to object
    const data = {};
    results.forEach(item => {
      const key = item.oid || item.fullOid?.split('.').slice(-1)[0];
      if (key) {
        data[key] = { value: item.value, type: item.type };
      }
    });
    
    res.json({
      success: true,
      ip: ip,
      port: targetPort,
      ...data
    });
  } catch (error) {
    console.error('[SNMP-BULK] Error:', error.message);
    res.status(500).json({ message: 'SNMP bulk get failed', error: error.message });
  }
});

// Equipment Logs by ID - DISABLED
// The frontend uses /api/equipment/logs with query params instead
// app.get('/api/equipment/logs/:equipmentId', authenticateToken,
//   param('equipmentId').isInt({ min: 1 }).withMessage('Invalid equipment ID'),
//   validateInput,
//   async (req, res) => {
//     try {
//       const { page = 1, limit = 100 } = req.query;
// 
//       const result = await db.getEquipmentLogs({
//         equipmentId: parseInt(req.params.equipmentId),
//         page: parseInt(page),
//         limit: parseInt(limit)
//       });
// 
//       res.json(result);
//     } catch (error) {
//       console.error('[API] Error fetching equipment logs:', error);
//       res.status(500).json({ message: 'Error fetching equipment logs' });
//     }
// });

// Airport routes (CRUD)
app.post('/api/airports', authenticateToken, authorize('admin', 'user_pusat'), [
  body('name').trim().notEmpty().withMessage('Name required'),
  body('city').trim().notEmpty().withMessage('City required'),
  body('lat').isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('lng').isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  body('ipBranch').optional().trim()
], validateInput, async (req, res) => {
  try {
    const newAirport = await db.createAirport({
      name: req.body.name,
      city: req.body.city,
      lat: parseFloat(req.body.lat),
      lng: parseFloat(req.body.lng),
      parentId: req.body.parentId ? parseInt(req.body.parentId) : null,
      ipBranch: req.body.ipBranch || null
    });
    res.status(201).json(newAirport);
  } catch (error) {
    console.error('[API] Error creating airport:', error);
    res.status(500).json({ message: 'Error creating airport' });
  }
});

app.put('/api/airports/:id', authenticateToken, authorize('admin', 'user_pusat'),
  param('id').isInt({ min: 1 }).withMessage('Invalid airport ID'),
  validateInput,
  async (req, res) => {
    try {
      const updated = await db.updateAirport(req.params.id, {
        name: req.body.name,
        city: req.body.city,
        lat: req.body.lat ? parseFloat(req.body.lat) : undefined,
        lng: req.body.lng ? parseFloat(req.body.lng) : undefined,
        parentId: req.body.hasOwnProperty('parentId') ? (req.body.parentId ? parseInt(req.body.parentId) : null) : undefined,
        ipBranch: req.body.ipBranch !== undefined ? req.body.ipBranch : undefined
      });
      
      if (!updated) {
        return res.status(404).json({ message: 'Airport not found' });
      }
      
      res.json(updated);
    } catch (error) {
      console.error('[API] Error updating airport:', error);
      res.status(500).json({ message: 'Error updating airport' });
    }
});

app.delete('/api/airports/:id', authenticateToken, authorize('admin'),
  param('id').isInt({ min: 1 }).withMessage('Invalid airport ID'),
  validateInput,
  async (req, res) => {
    try {
      await db.deleteAirport(req.params.id);
      res.json({ message: 'Airport deleted' });
    } catch (error) {
      console.error('[API] Error deleting airport:', error);
      // Check for specific error messages
      if (error.message.includes('equipment(s) still exist') || error.message.includes('child airport(s)')) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: 'Error deleting airport' });
    }
});

// User routes
app.get('/api/users', authenticateToken, authorize('admin', 'user_pusat'), async (req, res) => {
  try {
    const { search } = req.query;
    const users = await db.getAllUsers({ search });
    res.json(users);
  } catch (error) {
    console.error('[API] Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

app.get('/api/users/:id', authenticateToken, authorize('admin', 'user_pusat'),
  param('id').isInt({ min: 1 }).withMessage('Invalid user ID'),
  validateInput,
  async (req, res) => {
    try {
      const user = await db.getUserById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json(user);
    } catch (error) {
      console.error('[API] Error fetching user:', error);
      res.status(500).json({ message: 'Error fetching user' });
    }
  });

app.post('/api/users', authenticateToken, authorize('admin'), [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters'),
  body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').trim().notEmpty().withMessage('Name required'),
  body('role').isIn(['admin', 'user_pusat', 'teknisi_cabang', 'user_cabang']).withMessage('Invalid role')
], validateInput, async (req, res) => {
  try {
    let { username, password, name, role, branchId } = req.body;
    
    // Generate password if not provided
    if (!password) {
      // Generate a random 8-character password
      password = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    const newUser = await db.createUser({
      username,
      password: hashedPassword,
      name,
      role,
      branchId: branchId || null
    });
    
    res.status(201).json({...newUser, tempPassword: !req.body.password ? password : undefined});
  } catch (error) {
    console.error('[API] Error creating user:', error);
    if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
      return res.status(400).json({ message: 'Username already exists' });
    }
    res.status(500).json({ message: 'Error creating user' });
  }
});

app.put('/api/users/:id', authenticateToken, authorize('admin', 'user_pusat'),
  param('id').isInt({ min: 1 }).withMessage('Invalid user ID'),
  validateInput,
  async (req, res) => {
    try {
      const user = await db.getUserById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      if (user.role === 'admin' && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Cannot modify admin user' });
      }
      
      const updateData = {
        username: req.body.username,
        name: req.body.name,
        role: req.body.role,
        branchId: req.body.hasOwnProperty('branchId') ? req.body.branchId : undefined
      };
      
      if (req.body.password) {
        updateData.password = await bcrypt.hash(req.body.password, saltRounds);
      }
      
      const updated = await db.updateUser(req.params.id, updateData);
      res.json(updated);
    } catch (error) {
      console.error('[API] Error updating user:', error);
      res.status(500).json({ message: 'Error updating user' });
    }
});

app.delete('/api/users/:id', authenticateToken, authorize('admin'),
  param('id').isInt({ min: 1 }).withMessage('Invalid user ID'),
  validateInput,
  async (req, res) => {
    try {
      const user = await db.getUserById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Check if it's the last admin
      const allUsers = await db.getAllUsers();
      if (user.role === 'admin' && allUsers.filter(u => u.role === 'admin').length === 1) {
        return res.status(400).json({ message: 'Cannot delete the last admin' });
      }
      
      await db.deleteUser(req.params.id);
      res.json({ message: 'User deleted' });
    } catch (error) {
      console.error('[API] Error deleting user:', error);
      res.status(500).json({ message: 'Error deleting user' });
    }
});

// Serve static files
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

// ============================================
// SURVEILLANCE API ROUTES (RADAR & ADS-B)
// ============================================

// Get all surveillance stations
app.get('/api/surveillance/stations', authenticateToken, async (req, res) => {
  try {
    const { type, airportId, isActive } = req.query;
    const filters = {};
    if (type) filters.type = type;
    if (airportId) filters.airportId = parseInt(airportId);
    if (isActive !== undefined) filters.isActive = isActive === 'true';
    
    const stations = await db.getAllSurveillanceStations(filters);
    res.json(stations);
  } catch (error) {
    console.error('[API] Error fetching surveillance stations:', error);
    res.status(500).json({ message: 'Error fetching surveillance stations' });
  }
});

// Get single surveillance station
app.get('/api/surveillance/stations/:id', authenticateToken, 
  param('id').isInt({ min: 1 }).withMessage('Invalid station ID'),
  validateInput,
  async (req, res) => {
    try {
      const station = await db.getSurveillanceStationById(req.params.id);
      if (!station) {
        return res.status(404).json({ message: 'Station not found' });
      }
      res.json(station);
    } catch (error) {
      console.error('[API] Error fetching surveillance station:', error);
      res.status(500).json({ message: 'Error fetching surveillance station' });
    }
});

// Create surveillance station
app.post('/api/surveillance/stations', authenticateToken, authorize('admin', 'user_pusat'), [
  body('name').trim().notEmpty().withMessage('Name required'),
  body('type').isIn(['radar', 'adsb', 'mlat']).withMessage('Invalid type'),
  body('ip').trim().notEmpty().withMessage('IP required'),
  body('port').isInt({ min: 1, max: 65535 }).withMessage('Valid port required')
], validateInput, async (req, res) => {
  try {
    const station = await db.createSurveillanceStation({
      name: req.body.name,
      type: req.body.type,
      ip: req.body.ip,
      port: parseInt(req.body.port),
      multicastIp: req.body.multicastIp,
      lat: req.body.lat ? parseFloat(req.body.lat) : null,
      lng: req.body.lng ? parseFloat(req.body.lng) : null,
      airportId: req.body.airportId ? parseInt(req.body.airportId) : null,
      config: req.body.config,
      isActive: req.body.isActive !== undefined ? req.body.isActive : true
    });
    res.status(201).json(station);
  } catch (error) {
    console.error('[API] Error creating surveillance station:', error);
    res.status(500).json({ message: 'Error creating surveillance station' });
  }
});

// Update surveillance station
app.put('/api/surveillance/stations/:id', authenticateToken, authorize('admin', 'user_pusat'),
  param('id').isInt({ min: 1 }).withMessage('Invalid station ID'),
  validateInput,
  async (req, res) => {
    try {
      const station = await db.updateSurveillanceStation(req.params.id, {
        name: req.body.name,
        type: req.body.type,
        ip: req.body.ip,
        port: req.body.port ? parseInt(req.body.port) : undefined,
        multicastIp: req.body.multicastIp,
        lat: req.body.lat ? parseFloat(req.body.lat) : undefined,
        lng: req.body.lng ? parseFloat(req.body.lng) : undefined,
        airportId: req.body.airportId ? parseInt(req.body.airportId) : undefined,
        config: req.body.config,
        isActive: req.body.isActive
      });
      if (!station) {
        return res.status(404).json({ message: 'Station not found' });
      }
      res.json(station);
    } catch (error) {
      console.error('[API] Error updating surveillance station:', error);
      res.status(500).json({ message: 'Error updating surveillance station' });
    }
});

// Delete surveillance station
app.delete('/api/surveillance/stations/:id', authenticateToken, authorize('admin'),
  param('id').isInt({ min: 1 }).withMessage('Invalid station ID'),
  validateInput,
  async (req, res) => {
    try {
      await db.deleteSurveillanceStation(req.params.id);
      res.json({ message: 'Station deleted' });
    } catch (error) {
      console.error('[API] Error deleting surveillance station:', error);
      res.status(500).json({ message: 'Error deleting surveillance station' });
    }
});

// Get radar targets for a station
app.get('/api/surveillance/radar/:stationId', authenticateToken, 
  param('stationId').isInt({ min: 1 }).withMessage('Invalid station ID'),
  validateInput,
  async (req, res) => {
    try {
      const { limit = 100 } = req.query;
      const targets = await db.getRadarTargets(parseInt(req.params.stationId), {
        limit: parseInt(limit)
      });
      res.json(targets);
    } catch (error) {
      console.error('[API] Error fetching radar targets:', error);
      res.status(500).json({ message: 'Error fetching radar targets' });
    }
});

// Get all ADS-B aircraft
app.get('/api/surveillance/adsb', authenticateToken, async (req, res) => {
  try {
    const { limit = 500 } = req.query;
    const aircraft = await db.getAdsbAircraft({
      limit: parseInt(limit)
    });
    res.json(aircraft);
  } catch (error) {
    console.error('[API] Error fetching ADS-B aircraft:', error);
    res.status(500).json({ message: 'Error fetching ADS-B aircraft' });
  }
});

// Get surveillance status dashboard
app.get('/api/surveillance/status', authenticateToken, async (req, res) => {
  try {
    const stations = await db.getAllSurveillanceStations({});
    
    const radarStations = stations.filter(s => s.type === 'radar');
    const adsbStations = stations.filter(s => s.type === 'adsb');
    
    // Get recent radar targets count
    const radarTargets = await db.getRadarTargets(1, { limit: 1000 });
    const adsbAircraft = await db.getAdsbAircraft({ limit: 1000 });
    
    res.json({
      radar: {
        totalStations: radarStations.length,
        activeStations: radarStations.filter(s => s.isActive).length,
        totalTargets: radarTargets.length
      },
      adsb: {
        totalStations: adsbStations.length,
        activeStations: adsbStations.filter(s => s.isActive).length,
        totalAircraft: adsbAircraft.length
      },
      stations: stations
    });
  } catch (error) {
    console.error('[API] Error fetching surveillance status:', error);
    res.status(500).json({ message: 'Error fetching surveillance status' });
  }
});

app.post('/api/network/capture/start', authenticateToken, [
  body('interface').optional().trim(),
  body('filter').optional().trim()
], async (req, res) => {
  try {
    const { interface: iface, filter, duration = 60 } = req.body;
    
    // Validate inputs
    if (!iface && !filter) {
      return res.status(400).json({ error: 'Interface or filter required' });
    }
    
    const safeIface = iface ? iface.replace(/[^a-zA-Z0-9]/g, '') : 'any';
    const safeFilter = filter ? filter.replace(/[^a-zA-Z0-9: .]/g, '') : '';
    
    console.log(`[NETWORK-CAPTURE] Starting capture on ${safeIface} with filter "${safeFilter}" for ${duration}s`);
    
    res.json({ 
      message: 'Capture started',
      interface: safeIface,
      filter: safeFilter,
      duration: parseInt(duration),
      pid: process.pid 
    });
    
  } catch (error) {
    console.error('[NETWORK-CAPTURE] Error:', error);
    res.status(500).json({ error: 'Failed to start capture' });
  }
});

// Fetch ASTERIX data on-demand for a station (simulated if no real data)
app.post('/api/surveillance/fetch-asterix', authenticateToken, [
  body('stationId').isInt({ min: 1 }).withMessage('Valid station ID required')
], validateInput, async (req, res) => {
  try {
    const station = await db.getSurveillanceStationById(req.body.stationId);
    if (!station) {
      return res.status(404).json({ message: 'Station not found' });
    }
    
    if (station.type !== 'radar') {
      return res.status(400).json({ message: 'Station is not a radar station' });
    }
    
    // Try to get data from radar receiver if available
    let targets = [];
    let receiverStatus = 'disconnected';
    
    if (radarReceiver) {
      try {
        const result = await radarReceiver.fetchData(station.id);
        targets = result.targets || [];
        receiverStatus = result.status;
      } catch (err) {
        console.error('[API] Error fetching from radar receiver:', err.message);
      }
    }
    
    // If no targets from receiver, get from database
    if (targets.length === 0) {
      targets = await db.getRadarTargets(station.id, { limit: 50 });
    }
    
    res.json({
      station: station,
      targets: targets,
      receiverStatus: receiverStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] Error fetching ASTERIX data:', error);
    res.status(500).json({ message: 'Error fetching ASTERIX data' });
  }
});

// Get surveillance logs
app.get('/api/surveillance/logs', authenticateToken, async (req, res) => {
  try {
    const { stationId, logType, severity, page = 1, limit = 100 } = req.query;
    const filters = {};
    if (stationId) filters.stationId = parseInt(stationId);
    if (logType) filters.logType = logType;
    if (severity) filters.severity = severity;
    filters.page = parseInt(page);
    filters.limit = parseInt(limit);
    
    const logs = await db.getSurveillanceLogs(filters);
    res.json(logs);
  } catch (error) {
    console.error('[API] Error fetching surveillance logs:', error);
    res.status(500).json({ message: 'Error fetching surveillance logs' });
  }
});

// ============================================
// EQUIPMENT LOG SCHEDULER (Every 1 minute)
// ============================================

// Function to collect and save surveillance data (RADAR & ADS-B)
async function collectSurveillanceData() {
  try {
    console.log('[SCHEDULER-SURVEILLANCE] Starting surveillance data collection...');
    
    // Get all surveillance equipment
    const allEquipmentResult = await db.getAllEquipment({ limit: 10000, isActive: true });
    const equipmentList = allEquipmentResult.data || allEquipmentResult;
    
    // Filter for surveillance equipment (RADAR/ADS-B)
    const surveillanceEquipment = equipmentList.filter(item => {
      const config = item.snmpConfig || item.snmp_config;
      return item.category === 'Surveillance' && config && config.enabled && 
             (config.method === 'asterix' || config.method === 'adsb');
    });
    
    console.log(`[SCHEDULER-SURVEILLANCE] Found ${surveillanceEquipment.length} surveillance equipment`);
    
    for (const item of surveillanceEquipment) {
      try {
        const config = item.snmpConfig || item.snmp_config;
        
        if (config.method === 'asterix') {
          // Fetch RADAR data
          if (radarReceiver) {
            const stationId = item.id;
            const result = await radarReceiver.fetchData(stationId);
            
            const status = result.targets && result.targets.length > 0 ? 'Normal' : 'No Targets';
            
            // Update equipment status
            await db.updateEquipmentStatus(item.id, status);
            
            // Save log to equipment_logs (like SNMP)
            await db.createEquipmentLog({
              equipmentId: item.id,
              data: { 
                status: status,
                receiverStatus: result.status,
                targetsCount: result.targets ? result.targets.length : 0,
                lastTarget: result.targets && result.targets.length > 0 ? result.targets[0] : null,
                stationName: item.name,
                stationCode: item.code
              },
              source: 'asterix'
            });
            
            console.log(`[SCHEDULER-SURVEILLANCE] Saved RADAR log for: ${item.name} (${result.targets ? result.targets.length : 0} targets)`);
          } else {
            await db.createEquipmentLog({
              equipmentId: item.id,
              data: { status: 'Disconnected', receiverStatus: 'not_initialized', note: 'Radar receiver not available' },
              source: 'asterix'
            });
          }
        } else if (config.method === 'adsb') {
          const status = adsbReceiver ? 'Normal' : 'Disconnected';
          
          await db.updateEquipmentStatus(item.id, status);
          
          // Save log to equipment_logs (like SNMP)
          await db.createEquipmentLog({
            equipmentId: item.id,
            data: { 
              status: status,
              receiverAvailable: adsbReceiver !== null,
              stationName: item.name,
              stationCode: item.code,
              note: 'ADS-B data collected from multicast stream'
            },
            source: 'adsb'
          });
          
          console.log(`[SCHEDULER-SURVEILLANCE] Saved ADS-B log for: ${item.name}`);
        }
      } catch (err) {
        console.error(`[SCHEDULER-SURVEILLANCE] Error collecting surveillance data for ${item.name}:`, err.message);
        
        await db.createEquipmentLog({
          equipmentId: item.id,
          data: { error: err.message, status: 'Error' },
          source: config.method || 'surveillance'
        });
      }
    }
    
    console.log('[SCHEDULER-SURVEILLANCE] Completed surveillance data collection');
  } catch (error) {
    console.error('[SCHEDULER-SURVEILLANCE] Error in surveillance scheduled task:', error);
  }
}

// Function to collect and save data from all equipment
async function collectEquipmentData() {
  try {
    console.log('[SCHEDULER] Starting equipment data collection...');
    
    // Get all equipment with SNMP enabled
    const allEquipmentResult = await db.getAllEquipment({ limit: 10000 });
    const equipmentList = allEquipmentResult.data || allEquipmentResult;
    
    // Also get equipment with other connection methods (json, mqtt, modbus, etc.)
    let snmpEnabledEquipment = [];
    let otherEquipment = [];
    
    for (const item of equipmentList) {
      const config = item.snmpConfig || item.snmp_config;
      
      if (config && config.enabled) {
        if (config.method === 'snmp' || !config.method) {
          snmpEnabledEquipment.push(item);
        } else {
          otherEquipment.push({ ...item, connectionMethod: config.method || 'unknown' });
        }
      } else {
        // Equipment without any connection - still save basic info
        otherEquipment.push({ ...item, connectionMethod: 'none' });
      }
    }
    
    // Save logs for SNMP-enabled equipment
    for (const item of snmpEnabledEquipment) {
      try {
        // Menggunakan fungsi yang sudah di-refactor
        const { parsedData: data, status } = await fetchAndParseData(item);
        
        // Update equipment status
        await db.updateEquipmentStatus(item.id, status);
        
        // Save log
        await db.createEquipmentLog({
          equipmentId: item.id,
          data: { ...data, status },
          source: item.snmpConfig.templateId || 'snmp' // Gunakan templateId sebagai source
        });
        
        console.log(`[SCHEDULER] Saved SNMP log for: ${item.name} (${item.code})`);
      } catch (err) {
        console.error(`[SCHEDULER] Error fetching SNMP data for ${item.name}:`, err.message);
        
        // Still save error log
        await db.createEquipmentLog({
          equipmentId: item.id,
          data: { error: err.message, status: 'Error' },
          source: 'snmp'
        });
      }
    }
    
    // Save basic logs for all other equipment (including those without connection)
    for (const item of otherEquipment) {
      try {
        await db.createEquipmentLog({
          equipmentId: item.id,
          data: { 
            status: item.status || 'Normal', 
            method: item.connectionMethod,
            note: item.connectionMethod === 'none' ? 'No connection configured' : `${item.connectionMethod} connection not auto-collected`
          },
          source: item.connectionMethod === 'none' ? 'none' : item.connectionMethod
        });
      } catch (err) {
        console.error(`[SCHEDULER] Error saving log for ${item.name}:`, err.message);
      }
    }
    
    console.log(`[SCHEDULER] Completed. Processed ${snmpEnabledEquipment.length} SNMP devices, ${otherEquipment.length} other devices`);
  } catch (error) {
    console.error('[SCHEDULER] Error in scheduled task:', error);
  }
}

// Start scheduler - collect data every 1 minute (60000 ms)
let schedulerInterval = null;

function startScheduler() {
  // Run immediately on startup (with a small delay)
  setTimeout(async () => {
    await collectEquipmentData();
  }, 5000);
  
  // Then run every 1 minute
  schedulerInterval = setInterval(collectEquipmentData, 60000);
  console.log('[SCHEDULER] Equipment data collection scheduled every 1 minute');
  
  // Also start surveillance data collection (RADAR & ADS-B)
  setTimeout(async () => {
    await collectSurveillanceData();
  }, 8000); // Start 3 seconds after SNMP collection
  
  const surveillanceSchedulerInterval = setInterval(collectSurveillanceData, 60000);
  console.log('[SCHEDULER] Surveillance data collection scheduled every 1 minute');
}

function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[SCHEDULER] Scheduler stopped');
  }
}

// ============================================
// SURVEILLANCE INITIALIZATION
// ============================================

// Function to initialize surveillance receivers (RADAR & ADS-B)
function initializeSurveillance() {
  if (!RadarReceiver || !AdsbReceiver) {
    console.log('[SURVEILLANCE] Receiver modules not available, skipping initialization');
    return;
  }

  try {
    // Initialize RADAR receiver
    radarReceiver = new RadarReceiver({
      dataDir: path.join(__dirname, 'data'),
      onData: (type, station, data) => {
        // Save radar target to database
        if (type === 'radar' && data.targetNumber) {
          saveRadarTarget(station, data).catch(err => {
            console.error('[SURVEILLANCE] Error saving radar target:', err.message);
          });
        }
      },
      onError: (station, error) => {
        console.error(`[SURVEILLANCE] Radar error for ${station.name}:`, error.message);
      },
      onStatusChange: (station, oldStatus, newStatus) => {
        console.log(`[SURVEILLANCE] Radar ${station.name}: ${oldStatus} -> ${newStatus}`);
      }
    });
    
    // Start all radar stations
    radarReceiver.startAll();
    console.log('[SURVEILLANCE] RADAR receivers started');
    
    // Initialize ADS-B receiver
    adsbReceiver = new AdsbReceiver({
      dataDir: path.join(__dirname, 'data'),
      onData: (station, aircraft) => {
        // Save ADS-B aircraft to database
        saveAdsbAircraft(station, aircraft).catch(err => {
          console.error('[SURVEILLANCE] Error saving ADS-B aircraft:', err.message);
        });
      },
      onError: (error) => {
        console.error('[SURVEILLANCE] ADS-B error:', error.message);
      },
      onStatusChange: (oldStatus, newStatus) => {
        console.log(`[SURVEILLANCE] ADS-B: ${oldStatus} -> ${newStatus}`);
      }
    });
    
    // Start ADS-B receiver
    adsbReceiver.start();
    console.log('[SURVEILLANCE] ADS-B receiver started');
    
  } catch (error) {
    console.error('[SURVEILLANCE] Error initializing surveillance:', error.message);
  }
}

// Save radar target to database
async function saveRadarTarget(station, data) {
  try {
    // Check if db.saveRadarTarget exists, otherwise skip
    if (db.saveRadarTarget) {
      await db.saveRadarTarget({
        stationId: station.id,
        targetNumber: data.targetNumber,
        sac: data.sac,
        sic: data.sic,
        mode3A: data.mode3A,
        flightLevel: data.flightLevel,
        latitude: data.latitude,
        longitude: data.longitude,
        callsign: data.callsign,
        targetAddress: data.targetAddress,
        timeOfDay: data.timeOfDay,
        rawData: data
      });
    }
  } catch (error) {
    // Silently handle - don't crash the receiver
    console.debug('[SURVEILLANCE] Could not save radar target to DB:', error.message);
  }
}

// Save ADS-B aircraft to database
async function saveAdsbAircraft(station, data) {
  try {
    // Check if db.saveAdsbAircraft exists, otherwise skip
    if (db.saveAdsbAircraft) {
      await db.saveAdsbAircraft({
        icao24: data.icao24,
        callsign: data.callsign,
        latitude: data.latitude,
        longitude: data.longitude,
        altitude: data.altitude,
        velocity: data.velocity,
        heading: data.heading,
        stationId: station.id,
        rawData: data
      });
    }
  } catch (error) {
    // Silently handle - don't crash the receiver
    console.debug('[SURVEILLANCE] Could not save ADS-B aircraft to DB:', error.message);
  }
}

// Stop surveillance receivers
function stopSurveillance() {
  if (radarReceiver) {
    radarReceiver.stopAll();
    console.log('[SURVEILLANCE] RADAR receivers stopped');
  }
  if (adsbReceiver) {
    adsbReceiver.stop();
    console.log('[SURVEILLANCE] ADS-B receiver stopped');
  }
}

// Auto-Seed Bandara Jakarta & UPS System
async function seedUpsJakarta() {
  try {
    console.log('[SEED] Mengecek ketersediaan Bandara Jakarta dan UPS...');
    
    // 1. Cek Bandara Jakarta
    const airports = await db.getAllAirports();
    let jakartaAirport = airports.find(a => a.city.toLowerCase().includes('jakarta') || a.name.toLowerCase().includes('soekarno'));
    
    if (!jakartaAirport) {
      jakartaAirport = await db.createAirport({
        name: 'Bandara Soekarno-Hatta',
        city: 'Jakarta',
        lat: -6.1256,
        lng: 106.6558,
        parentId: null
      });
      console.log('[SEED] Berhasil membuat Bandara Soekarno-Hatta (Jakarta).');
    }
    
    // 2. Cek UPS System
    const equipment = await db.getAllEquipment({ limit: 10000 });
    const equipmentList = equipment.data || equipment;
    const hasUps = equipmentList.find(e => e.code === 'UPS-CGK-01');
    
    if (!hasUps) {
      await db.createEquipment({
        name: 'UPS Main Server JKT',
        code: 'UPS-CGK-01',
        category: 'Support',
        status: 'Normal',
        airportId: jakartaAirport.id,
        branchId: jakartaAirport.id,
        description: 'Uninterruptible Power Supply Main Server Room (Auto Generated)',
        snmpConfig: { enabled: true, method: 'snmp', ip: '192.168.10.50', port: 161, community: 'public', templateId: 'ups_system' },
        isActive: true,
        ipAddress: '192.168.10.50'
      });
      console.log('[SEED] Berhasil menambahkan Alat UPS System (UPS-CGK-01) di Bandara Jakarta!');
    }
  } catch (e) {
    console.error('[SEED] Gagal melakukan otomatisasi seed data UPS:', e.message);
  }
}

// ============================================
// START SERVER
// ============================================

async function startServer() {
  try {
    // Initialize SNMP templates cache
    await initializeSnmpTemplates();

    // Seed Bandara Jakarta & UPS System
    await seedUpsJakarta();

    // Start the equipment data collection scheduler
    startScheduler();

    // Initialize surveillance receivers (RADAR & ADS-B)
    initializeSurveillance();

    // Initialize RCMS/DME/DVOR data collector
    const equipmentService = new EquipmentService(db);
    const rcmsScheduler = new DataCollectorScheduler(equipmentService);
    rcmsScheduler.start();
    console.log('[RCMS] Data collector scheduler started');

    // Initialize Connection Tester (auto ping equipment)
    connectionTester.initializeConnectionTester();
    console.log('[CONN_TEST] Connection tester initialized');

    // ============================================
    // NETWORK MONITORING ROUTES
    // ============================================
    
    const networkMonitor = require('./src/network/monitor-fixed');
    const packetSniffer = require('./src/network/sniffer');

    // Get all network interfaces
    app.get('/api/network/interfaces', async (req, res) => {
      try {
        const interfaces = await networkMonitor.getNetworkInterfaces();
        res.json({ success: true, data: interfaces });
      } catch (error) {
        console.error('[Network API] Error getting interfaces:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get network statistics
    app.get('/api/network/stats', async (req, res) => {
      try {
        const stats = await networkMonitor.getNetworkStats();
        res.json({ success: true, data: stats });
      } catch (error) {
        console.error('[Network API] Error getting stats:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Ping a host
    app.post('/api/network/ping', async (req, res) => {
      try {
        const { host, count } = req.body;
        if (!host) {
          return res.status(400).json({ success: false, error: 'Host is required' });
        }
        const result = await networkMonitor.pingHost(host, count || 4);
        res.json({ success: true, data: result });
      } catch (error) {
        console.error('[Network API] Ping error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test connectivity to multiple hosts
    app.post('/api/network/test-connectivity', async (req, res) => {
      try {
        const { hosts } = req.body;
        const targetHosts = hosts || ['8.8.8.8', '1.1.1.1', 'google.com'];
        const results = await networkMonitor.testConnectivity(targetHosts);
        res.json({ success: true, data: results });
      } catch (error) {
        console.error('[Network API] Connectivity test error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get system network info
    app.get('/api/network/info', async (req, res) => {
      try {
        const info = await networkMonitor.getSystemNetworkInfo();
        res.json({ success: true, data: info });
      } catch (error) {
        console.error('[Network API] Error getting system info:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get ARP table (known devices on network)
    app.get('/api/network/arp-table', async (req, res) => {
      try {
        const arpTable = await networkMonitor.getArpTable();
        res.json({ success: true, data: arpTable });
      } catch (error) {
        console.error('[Network API] Error getting ARP table:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Discover active devices on the network
    app.get('/api/network/discover-devices', async (req, res) => {
      try {
        const devices = await networkMonitor.discoverNetworkDevices();
        res.json({ success: true, data: devices });
      } catch (error) {
        console.error('[Network API] Error discovering devices:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get local network information (your device details)
    app.get('/api/network/local-info', async (req, res) => {
      try {
        const localInfo = await networkMonitor.getLocalNetworkInfo();
        res.json({ success: true, data: localInfo });
      } catch (error) {
        console.error('[Network API] Error getting local network info:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get traffic by device
    app.get('/api/network/device-traffic', async (req, res) => {
      try {
        const traffic = await networkMonitor.getDeviceTraffic();
        res.json({ success: true, data: traffic });
      } catch (error) {
        console.error('[Network API] Error getting device traffic:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ============================================
    // PACKET SNIFFER ROUTES
    // ============================================

    // Start packet capture
    app.post('/api/sniffer/start', async (req, res) => {
      try {
        const { interface } = req.body;
        await packetSniffer.start(interface);
        res.json({ success: true, message: 'Packet capture started' });
      } catch (error) {
        console.error('[Sniffer API] Start error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Stop packet capture
    app.post('/api/sniffer/stop', (req, res) => {
      try {
        packetSniffer.stop();
        res.json({ success: true, message: 'Packet capture stopped' });
      } catch (error) {
        console.error('[Sniffer API] Stop error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get captured packets
    app.get('/api/sniffer/packets', (req, res) => {
      try {
        const { protocol, source, destination, interface: iface } = req.query;
        const filter = { protocol, source, destination, interface: iface };
        const packets = packetSniffer.getPackets(filter);
        res.json({ success: true, data: packets });
      } catch (error) {
        console.error('[Sniffer API] Error getting packets:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get packet statistics
    app.get('/api/sniffer/stats', (req, res) => {
      try {
        const stats = packetSniffer.getStatistics();
        res.json({ success: true, data: stats });
      } catch (error) {
        console.error('[Sniffer API] Stats error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get packet details
    app.get('/api/sniffer/packets/:number', (req, res) => {
      try {
        const { number } = req.params;
        const details = packetSniffer.getPacketDetails(parseInt(number));
        if (!details) {
          return res.status(404).json({ success: false, error: 'Packet not found' });
        }
        res.json({ success: true, data: details });
      } catch (error) {
        console.error('[Sniffer API] Details error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Helper: build XML from packet list
    function packetsToXml(packets) {
      const escape = str => String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<packets>\n';
      for (const packet of packets) {
        xml += '  <packet>\n';
        xml += `    <number>${escape(packet.number)}</number>\n`;
        xml += `    <time>${escape(packet.time)}</time>\n`;
        xml += `    <interface>${escape(packet.interface)}</interface>\n`;
        xml += `    <source>${escape(packet.source)}</source>\n`;
        xml += `    <destination>${escape(packet.destination)}</destination>\n`;
        xml += `    <protocol>${escape(packet.protocol)}</protocol>\n`;
        xml += `    <length>${escape(packet.length)}</length>\n`;
        xml += `    <direction>${escape(packet.direction)}</direction>\n`;
        xml += `    <info>${escape(packet.info)}</info>\n`;
        xml += '  </packet>\n';
      }
      xml += '</packets>';
      return xml;
    }

    // Helper: create a simple PCAP file from packet list (uses packet.rawData when available)
    function packetsToPcap(packets) {
      const toBuffer = (value, length, littleEndian = true) => {
        const buf = Buffer.alloc(length);
        if (littleEndian) buf.writeUIntLE(value, 0, length);
        else buf.writeUIntBE(value, 0, length);
        return buf;
      };

      const GLOBAL_HEADER = Buffer.concat([
        Buffer.from([0xd4,0xc3,0xb2,0xa1]), // magic
        toBuffer(2, 2), // version major
        toBuffer(4, 2), // version minor
        toBuffer(0, 4), // thiszone
        toBuffer(0, 4), // sigfigs
        toBuffer(65535, 4), // snaplen
        toBuffer(1, 4) // network (Ethernet)
      ]);

      const records = [];

      for (const pkt of packets) {
        const tsSec = Math.floor((pkt.time || Date.now()/1000));
        const tsUsec = Math.floor(((pkt.time || Date.now()/1000) - tsSec) * 1e6);

        let data = null;
        if (pkt.rawData && typeof pkt.rawData === 'string') {
          const hex = pkt.rawData.replace(/[^0-9a-fA-F]/g, '');
          const buf = Buffer.alloc(Math.ceil(hex.length/2));
          for (let i = 0; i < buf.length; i++) {
            buf[i] = parseInt(hex.substr(i*2, 2) || '00', 16);
          }
          data = buf;
        }

        if (!data) {
          // create placeholder packet bytes if none exist
          data = Buffer.alloc(Math.max(1, pkt.length || 1), 0);
        }

        const inclLen = data.length;
        const origLen = data.length;
        const header = Buffer.concat([
          toBuffer(tsSec, 4),
          toBuffer(tsUsec, 4),
          toBuffer(inclLen, 4),
          toBuffer(origLen, 4)
        ]);

        records.push(header);
        records.push(data);
      }

      return Buffer.concat([GLOBAL_HEADER, ...records]);
    }

    // Export packets
    app.get('/api/sniffer/export', (req, res) => {
      try {
        const { format } = req.query;
        const packets = packetSniffer.getPackets();

        if (format === 'csv') {
          const data = packetSniffer.export('csv');
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename="packets.csv"');
          return res.send(data);
        }

        if (format === 'xml') {
          const xml = packetsToXml(packets);
          res.setHeader('Content-Type', 'application/xml');
          res.setHeader('Content-Disposition', 'attachment; filename="packets.xml"');
          return res.send(xml);
        }

        if (format === 'pcap') {
          const pcap = packetsToPcap(packets);
          res.setHeader('Content-Type', 'application/vnd.tcpdump.pcap');
          res.setHeader('Content-Disposition', 'attachment; filename="packets.pcap"');
          return res.send(pcap);
        }

        // Default JSON
        const data = packetSniffer.export('json');
        res.json({ success: true, data });
      } catch (error) {
        console.error('[Sniffer API] Export error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Clear captured packets
    app.post('/api/sniffer/clear', (req, res) => {
      try {
        packetSniffer.clear();
        res.json({ success: true, message: 'Packets cleared' });
      } catch (error) {
        console.error('[Sniffer API] Clear error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Note: WebSocket server needs HTTP server instance
    // To enable WebSocket, use: const server = app.listen(PORT, ...) and pass server to websocketServer.initializeWebSocket(server)

    app.listen(PORT, () => {
      console.log(`========================================`);
      console.log(`Server is running on http://localhost:${PORT}`);
      console.log(`========================================`);
      console.log(`[DB] MySQL database connected`);
      console.log(`[SECURITY] Password hashing enabled`);
      console.log(`[SECURITY] JWT authentication enabled`);
      console.log(`[SECURITY] Rate limiting enabled`);
      console.log(`[SECURITY] Helmet security headers enabled`);
      console.log(`[PERFORMANCE] Pagination enabled (100 items/page)`);
      console.log(`[SURVEILLANCE] RADAR (ASTERIX) & ADS-B enabled`);
      console.log(`[RCMS] DME/DVOR collector enabled`);
    });
  } catch (error) {
    console.error('[SERVER] Failed to start:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[SERVER] Shutting down...');
  stopScheduler();
  stopSurveillance();
  if (rcmsScheduler) {
    rcmsScheduler.stop();
  }
  connectionManager.disconnectAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[SERVER] Shutting down...');
  stopScheduler();
  stopSurveillance();
  if (rcmsScheduler) {
    rcmsScheduler.stop();
  }
  connectionManager.disconnectAll();
  process.exit(0);
});

startServer();

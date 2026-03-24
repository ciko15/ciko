import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';
import { jwt } from '@elysiajs/jwt';
import { serverTiming } from '@elysiajs/server-timing';

// Import services and managers
const db = require('../db/database');
const EquipmentService = require('./services/equipment');
const DataCollectorScheduler = require('./scheduler/collector');
const connectionManager = require('./connection/manager');
const thresholdEvaluator = require('./utils/thresholdEvaluator');
const connectionTester = require('./scheduler/test_connection');
// const websocketServer = require('./websocket/server'); // We'll handle WS separately in Elysia
const templateService = require('./services/template');

// Import Surveillance Receivers
let RadarReceiver: any = null;
let AdsbReceiver: any = null;

try {
    RadarReceiver = require('../Backend/parse/radar_receiver');
    AdsbReceiver = require('../Backend/parse/adsb_receiver');
    console.log('[SURVEILLANCE] Radar and ADS-B receiver modules loaded');
} catch (err: any) {
    console.warn('[SURVEILLANCE] Could not load receiver modules:', err.message);
}

const PORT = process.env.PORT || 3100;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

// Global State
export const state = {
    snmpTemplatesCache: null as any,
    snmpDataCache: {} as Record<string, any>,
    customSnmpData: {
        moxa_ioThinx_4150: null,
        radar_system: null,
        generic_snmp: null
    } as Record<string, any>,
    simulationMode: true
};

// Captcha Helper
const generateCaptcha = () => {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    return { question: `${num1} + ${num2} = ?`, answer: num1 + num2 };
};

// --- BACKGROUND TASKS ---
async function collectEquipmentData() {
    try {
        const fetchAndParseData = require('./utils/network').fetchAndParseData;
        console.log('[SCHEDULER] Starting equipment data collection...');
        const allEquipment = await db.getAllEquipment({ limit: 10000 });
        const equipmentList = allEquipment.data || allEquipment;

        for (const item of equipmentList) {
            const config = item.snmpConfig || item.snmp_config;
            if (config?.enabled) {
                try {
                    const { parsedData, status } = await fetchAndParseData(item);
                    await db.updateEquipmentStatus(item.id, status);
                    await db.createEquipmentLog({
                        equipmentId: item.id,
                        data: { ...parsedData, status },
                        source: config.templateId || 'snmp'
                    });
                } catch (err: any) {
                    console.error(`[SCHEDULER] Error for ${item.name}:`, err.message);
                }
            }
        }
    } catch (error) {
        console.error('[SCHEDULER] Error:', error);
    }
}

async function collectSurveillanceData() {
    // Basic placeholder for surveillance data collection (RADAR/ADSB)
    console.log('[SCHEDULER] Surveillance data collection triggered');
}

async function seedUpsJakarta() {
    try {
        console.log('[SEED] Checking initial data...');
        const airports = await db.getAllAirports();
        let jakarta = airports.find((a: any) => a.city.toLowerCase().includes('jakarta'));
        if (!jakarta) {
            jakarta = await db.createAirport({ name: 'Bandara Soekarno-Hatta', city: 'Jakarta', lat: -6.1256, lng: 106.6558 });
            console.log('[SEED] Created Jakarta airport');
        }
    } catch (e: any) {
        console.error('[SEED] Failed:', e.message);
    }
}

// --- MIDDLEWARE ---
const authenticate = (app: Elysia) => 
    app.derive(async ({ jwt, headers, set }: any) => {
        const authHeader = headers['authorization'];
        if (!authHeader) {
            set.status = 401;
            return { user: null };
        }
        
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
        const user = await jwt.verify(token);
        
        if (!user) {
            set.status = 401;
            return { user: null };
        }
        
        return { user };
    })
    .onBeforeHandle(({ user, set }: any) => {
        if (!user) {
            set.status = 401;
            return { message: 'Unauthorized' };
        }
    });

const authorize = (roles: string[]) => ({ user, set }: any) => {
    if (!user || !roles.includes(user.role)) {
        set.status = 403;
        return { message: 'Forbidden: Access denied' };
    }
};

// Initialize Elysia
const app = new Elysia()
    .use(cors())
    .use(serverTiming())
    .use(staticPlugin({
        assets: 'public',
        prefix: '/'
    }))
    .use(
        jwt({
            name: 'jwt',
            secret: JWT_SECRET
        })
    )
    .state('simulationMode', true)
    
    // --- AUTH ---
    .group('/api/auth', (app) => 
        app
            .get('/captcha', () => generateCaptcha())
            .post('/login', async ({ body, jwt, set }) => {
                const { username, password, captchaAnswer, originalCaptchaAnswer } = body as any;
                
                // Simple validation for development
                if (captchaAnswer != originalCaptchaAnswer) {
                    set.status = 400;
                    return { message: 'Captcha salah' };
                }

                try {
                    const user = await db.getUserByUsername(username);
                    if (!user) {
                        set.status = 401;
                        return { message: 'User tidak ditemukan' };
                    }

                    if (password !== user.password) {
                        set.status = 401;
                        return { message: 'Password salah' };
                    }

                    const token = await jwt.sign({
                        id: user.id,
                        username: user.username,
                        role: user.role,
                        branchId: user.branch_id
                    });

                    return {
                        message: 'Login berhasil',
                        token,
                        user: {
                            id: user.id,
                            username: user.username,
                            role: user.role,
                            fullName: user.full_name,
                            branchId: user.branch_id
                        }
                    };
                } catch (error: any) {
                    set.status = 500;
                    return { message: 'Internal Server Error', error: error.message };
                }
            }, {
                body: t.Object({
                    username: t.String(),
                    password: t.String(),
                    captchaAnswer: t.Any(),
                    originalCaptchaAnswer: t.Any()
                })
            })
    )

    // --- PROTECTED ROUTES ---
    .use(authenticate)
    .group('/api/equipment', (app) =>
        app
            // Equipment List
            .get('/', async ({ query, user, set }) => {
                try {
                    const { airportId, branchId, category, isActive, page = 1, limit = 1000, includeData } = query;
                    
                    let effectiveBranchId = user.branchId;
                    if (!effectiveBranchId) {
                        effectiveBranchId = branchId ? parseInt(branchId as string) : (airportId ? parseInt(airportId as string) : undefined);
                    }

                    const result = await db.getAllEquipment({
                        branchId: effectiveBranchId,
                        category: (category as string) || undefined,
                        isActive: isActive === 'all' ? 'all' : isActive === 'false' ? false : true,
                        page: parseInt(page as string),
                        limit: parseInt(limit as string),
                        includeData: includeData === 'true'
                    });

                    return result;
                } catch (error: any) {
                    set.status = 500;
                    return { message: error.message };
                }
            })
            // Equipment Logs
            .get('/logs', async ({ query, set }) => {
                try {
                    const { equipmentId, source, from, to, page = 1, limit = 100 } = query;
                    const result = await db.getEquipmentLogs({
                        equipmentId: equipmentId ? parseInt(equipmentId as string) : undefined,
                        source: (source as string) || undefined,
                        from: (from as string) || undefined,
                        to: (to as string) || undefined,
                        page: parseInt(page as string),
                        limit: parseInt(limit as string)
                    });
                    return result;
                } catch (error: any) {
                    set.status = 500;
                    return { message: error.message };
                }
            })
            // Individual Equipment
            .get('/:id', async ({ params, set }) => {
                try {
                    const item = await db.getEquipmentById(params.id);
                    if (!item) {
                        set.status = 404;
                        return { message: 'Equipment not found' };
                    }
                    return item;
                } catch (error: any) {
                    set.status = 500;
                    return { message: error.message };
                }
            })
            // Create Equipment
            .post('/', async ({ body, set }) => {
                try {
                    const b = body as any;
                    const branchId = b.branchId || b.airportId;
                    const ipAddress = b.ipAddress || (b.snmpConfig && b.snmpConfig.ip);
                    
                    const newEquipment = await db.createEquipment({
                        ...b,
                        branchId: parseInt(branchId),
                        airportId: b.airportId ? parseInt(b.airportId) : undefined,
                        ipAddress
                    });
                    set.status = 201;
                    return newEquipment;
                } catch (error: any) {
                    set.status = 500;
                    return { message: error.message };
                }
            }, { beforeHandle: authorize(['admin', 'user_pusat', 'teknisi_cabang']) })
            // Update Equipment
            .put('/:id', async ({ params, body, set }) => {
                try {
                    const b = body as any;
                    const branchId = b.branchId || b.airportId;
                    const ipAddress = b.ipAddress || (b.snmpConfig && b.snmpConfig.ip);
                    
                    const updated = await db.updateEquipment(params.id, {
                        ...b,
                        branchId: branchId ? parseInt(branchId) : undefined,
                        airportId: b.airportId ? parseInt(b.airportId) : undefined,
                        ipAddress
                    });
                    
                    if (!updated) {
                        set.status = 404;
                        return { message: 'Equipment not found' };
                    }
                    return updated;
                } catch (error: any) {
                    set.status = 500;
                    return { message: error.message };
                }
            }, { beforeHandle: authorize(['admin', 'user_pusat', 'teknisi_cabang']) })
            // Delete Equipment
            .delete('/:id', async ({ params, set }) => {
                try {
                    await db.deleteEquipment(params.id);
                    return { message: 'Equipment deleted' };
                } catch (error: any) {
                    set.status = 500;
                    return { message: error.message };
                }
            }, { beforeHandle: authorize(['admin', 'user_pusat']) })
            // Ping Equipment (Multi-tier)
            .get('/:id/ping', async ({ params, set }) => {
                const { ip_address, isValidIP, snmpGet } = require('./utils/network');
                try {
                    const item = await db.getEquipmentById(params.id);
                    if (!item) {
                        set.status = 404;
                        return { message: 'Equipment not found' };
                    }
                    
                    const config = item.snmpConfig || item.snmp_config;
                    const ip = item.ip_address || (config && config.ip);
                    
                    if (state.simulationMode) {
                        const isAlive = Math.random() > 0.05;
                        const mockRtt = Math.floor(Math.random() * 40) + 10;
                        return {
                            success: isAlive,
                            equipmentId: item.id,
                            equipmentName: item.name,
                            ip: ip || 'simulated-ip',
                            status: isAlive ? 'online' : 'offline',
                            timestamp: new Date().toISOString()
                        };
                    }

                    if (!ip || !isValidIP(ip)) {
                        set.status = 400;
                        return { message: 'Invalid IP configured' };
                    }

                    const ping = require('ping');
                    const result = await ping.promise.probe(ip, { timeout: 3 });
                    return {
                        success: result.alive,
                        equipmentId: item.id,
                        status: result.alive ? 'online' : 'offline',
                        statistics: result.alive ? { avg: result.time } : null,
                        timestamp: new Date().toISOString()
                    };
                } catch (error: any) {
                    set.status = 500;
                    return { message: error.message };
                }
            })
    )

    // --- AIRPORT ROUTES ---
    .group('/api/airports', (app) =>
        app
            .get('/', async () => await db.getAllAirports())
            .get('/:id', async ({ params, set }) => {
                const item = await db.getAirportById(params.id);
                if (!item) {
                    set.status = 404;
                    return { message: 'Airport not found' };
                }
                return item;
            })
            .post('/', async ({ body, set }) => {
                const item = await db.createAirport(body);
                set.status = 201;
                return item;
            }, { beforeHandle: authorize(['admin', 'user_pusat']) })
            .put('/:id', async ({ params, body, set }) => {
                const updated = await db.updateAirport(params.id, body);
                if (!updated) {
                    set.status = 404;
                    return { message: 'Airport not found' };
                }
                return updated;
            }, { beforeHandle: authorize(['admin', 'user_pusat']) })
            .delete('/:id', async ({ params }) => {
                await db.deleteAirport(params.id);
                return { message: 'Airport deleted' };
            }, { beforeHandle: authorize(['admin']) })
    )

    // --- BRANCH ROUTES ---
    .get('/api/branches', async () => await db.getAllAirports())

    // --- SNMP ROUTES ---
    .group('/api/snmp', (app) =>
        app
            .get('/templates', async () => {
                const templates = await db.getAllSnmpTemplates();
                // Add built-in templates
                const builtins = [
                    { id: 'dvor_maru_220', name: 'DVOR MARU 220', isDefault: true },
                    { id: 'dme_maru_310_320', name: 'DME MARU 310/320', isDefault: true }
                ];
                builtins.forEach(b => {
                    if (!templates.find((t: any) => t.id === b.id)) templates.push(b);
                });
                return templates;
            })
            .get('/templates/:id', async ({ params, set }) => {
                const template = await db.getSnmpTemplateById(params.id);
                if (!template) {
                    set.status = 404;
                    return { message: 'Template not found' };
                }
                return template;
            })
            .post('/templates', async ({ body, set }) => {
                try {
                    const id = 'custom_' + Date.now();
                    const newTemplate = await db.createSnmpTemplate({ ...body, id, isDefault: false });
                    set.status = 201;
                    return newTemplate;
                } catch (error: any) {
                    set.status = 500;
                    return { message: error.message };
                }
            }, { beforeHandle: authorize(['admin', 'user_pusat']) })
            .put('/templates/:id', async ({ params, body, set }) => {
                const updated = await db.updateSnmpTemplate(params.id, body);
                if (!updated) {
                    set.status = 404;
                    return { message: 'Template not found' };
                }
                return updated;
            }, { beforeHandle: authorize(['admin', 'user_pusat']) })
            .delete('/templates/:id', async ({ params, set }) => {
                const deleted = await db.deleteSnmpTemplate(params.id);
                if (!deleted) {
                    set.status = 404;
                    return { message: 'Template not found' };
                }
                return { message: 'Template deleted' };
            }, { beforeHandle: authorize(['admin', 'user_pusat']) })
            .post('/test', async ({ body, set }) => {
                const { snmpGet } = require('./utils/network');
                const { ip, port, community, oid } = body as any;
                try {
                    const result = await snmpGet(oid, ip, port, community);
                    return { success: true, ...result };
                } catch (error: any) {
                    set.status = 500;
                    return { success: false, message: error.message };
                }
            })
    )
    
    // --- THRESHOLD ROUTES ---
    .group('/api/equipment/:equipmentId/thresholds', (app) =>
        app
            .get('/', async ({ params }) => await db.getThresholdsByEquipment(params.equipmentId))
            .post('/', async ({ params, body, set }) => {
                const threshold = await db.createThreshold({ ...body, equipment_id: parseInt(params.equipmentId) });
                set.status = 201;
                return threshold;
            }, { beforeHandle: authorize(['admin', 'user_pusat']) })
            .put('/:thresholdId', async ({ params, body, set }) => {
                const updated = await db.updateThreshold(params.thresholdId, body);
                if (!updated) {
                    set.status = 404;
                    return { message: 'Threshold not found' };
                }
                return updated;
            }, { beforeHandle: authorize(['admin', 'user_pusat']) })
            .delete('/:thresholdId', async ({ params }) => {
                await db.deleteThreshold(params.thresholdId);
                return { message: 'Threshold deleted' };
            }, { beforeHandle: authorize(['admin', 'user_pusat']) })
    )

    // --- PARSER ROUTES ---
    .post('/api/parser/test', async ({ body, set }) => {
        try {
            const ParserFactory = require('./parsers/factory');
            const { connectionType, parserConfig, sampleData } = body as any;
            const parser = ParserFactory.createParser(connectionType, { parser_config: parserConfig });
            if (!parser) {
                set.status = 400;
                return { message: `Unsupported connection type: ${connectionType}` };
            }
            const result = parser.parse(sampleData);
            return { success: true, parsed: result };
        } catch (error: any) {
            set.status = 500;
            return { success: false, error: error.message };
        }
    })

    // --- NETWORK MONITORING ROUTES ---
    .group('/api/network', (app) => {
        const networkMonitor = require('./network/monitor-fixed');
        return app
            .get('/interfaces', async () => ({ success: true, data: await networkMonitor.getNetworkInterfaces() }))
            .get('/stats', async () => ({ success: true, data: await networkMonitor.getNetworkStats() }))
            .post('/ping', async ({ body }) => {
                const { host, count } = body as any;
                return { success: true, data: await networkMonitor.pingHost(host, count || 4) };
            })
            .post('/test-connectivity', async ({ body }) => {
                const { hosts } = body as any;
                return { success: true, data: await networkMonitor.testConnectivity(hosts || ['8.8.8.8', '1.1.1.1']) };
            })
            .get('/info', async () => ({ success: true, data: await networkMonitor.getSystemNetworkInfo() }))
            .get('/arp-table', async () => ({ success: true, data: await networkMonitor.getArpTable() }))
            .get('/discover-devices', async () => ({ success: true, data: await networkMonitor.discoverNetworkDevices() }))
            .get('/local-info', async () => ({ success: true, data: await networkMonitor.getLocalNetworkInfo() }))
            .get('/device-traffic', async () => ({ success: true, data: await networkMonitor.getDeviceTraffic() }));
    })

    // --- PACKET SNIFFER ROUTES ---
    .group('/api/sniffer', (app) => {
        const packetSniffer = require('./network/sniffer');
        return app
            .post('/start', async ({ body }) => {
                const { interface: iface } = body as any;
                await packetSniffer.start(iface);
                return { success: true, message: 'Packet capture started' };
            })
            .post('/stop', () => {
                packetSniffer.stop();
                return { success: true, message: 'Packet capture stopped' };
            })
            .get('/packets', ({ query }) => ({ success: true, data: packetSniffer.getPackets(query) }))
            .get('/stats', () => ({ success: true, data: packetSniffer.getStatistics() }))
            .get('/packets/:number', ({ params, set }) => {
                const details = packetSniffer.getPacketDetails(parseInt(params.number));
                if (!details) {
                    set.status = 404;
                    return { success: false, error: 'Packet not found' };
                }
                return { success: true, data: details };
            })
            .post('/clear', () => {
                packetSniffer.clear();
                return { success: true, message: 'Packets cleared' };
            });
    })

    .get('/health', () => ({ status: 'ok', runtime: 'Bun', framework: 'Elysia' }))
    
    .listen(PORT);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);

// Initialize Services (similar to server.js)
async function startServices() {
    try {
        console.log('[SYSTEM] Initializing core services...');
        
        // 1. Initial Seeding
        await seedUpsJakarta();

        // 2. Load SNMP Templates into cache
        state.snmpTemplatesCache = await db.getAllSnmpTemplates();
        console.log(`[SNMP] ${state.snmpTemplatesCache.length} templates loaded`);

        // 3. Start Background Schedulers
        setInterval(collectEquipmentData, 60000);
        setInterval(collectSurveillanceData, 60000);
        
        // Initial run after a short delay
        setTimeout(collectEquipmentData, 5000);
        setTimeout(collectSurveillanceData, 8000);

        // 4. Initialize Surveillance Receivers if available
        if (RadarReceiver) {
            console.log('[SURVEILLANCE] Initializing Radar and ADS-B receivers...');
            // In a real migration, we'd initialize the classes here
        }

        console.log('[SYSTEM] All services initialized successfully');
    } catch (err) {
        console.error('[SYSTEM] Error during service initialization:', err);
    }
}

startServices();

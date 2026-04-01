import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';
import { jwt } from '@elysiajs/jwt';
import { serverTiming } from '@elysiajs/server-timing';
import bcrypt from 'bcryptjs';
import ping from 'ping';


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
let radarReceiver: any = null;
let adsbReceiver: any = null;

try {
    RadarReceiver = require('../Backend/parse/radar_receiver');
    AdsbReceiver = require('../Backend/parse/adsb_receiver');
    console.log('[SURVEILLANCE] Radar and ADS-B receiver modules loaded');
} catch (err: any) {
    console.warn('[SURVEILLANCE] Could not load receiver modules:', err.message);
}

const PORT = process.env.PORT || 3100;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';
const saltRounds = 10;

// Global State
export const state = {
    snmpTemplatesCache: null as any,
    snmpDataCache: {} as Record<string, any>,
    customSnmpData: {
        moxa_ioThinx_4150: null,
        radar_system: null,
        generic_snmp: null
    } as Record<string, any>,
    simulationMode: true,
    ping: {
        interval: null as any,
        results: [] as any[],
        currentIp: null as string | null,
        maxResults: 100
    }
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
        const networkUtils = require('./utils/network');
        const fetchAndParseData = networkUtils.fetchAndParseData;
        const pingTiered = networkUtils.pingTiered;
        console.log('[SCHEDULER] Starting equipment data collection...');
        const allEquipment = await db.getAllEquipment({ limit: 10000 });
        const equipmentList = allEquipment.data || allEquipment;

        for (const item of equipmentList) {
            const config = item.snmpConfig || item.snmp_config;
            if (config?.enabled) {
                try {
                    const pingResult = await pingTiered(item.id);
                    if (!pingResult.success) {
                        await db.updateEquipmentStatus(item.id, 'Disconnect');
                        await db.createEquipmentLog({
                            equipmentId: item.id,
                            data: { status: 'Disconnect', message: pingResult.message || 'Device Unreachable' },
                            source: config.templateId || 'snmp'
                        });
                        continue;
                    }
                    
                    const { parsedData, status, triggeredParameters } = await fetchAndParseData(item);
                    await db.updateEquipmentStatus(item.id, status);
                    await db.createEquipmentLog({
                        equipmentId: item.id,
                        data: { ...parsedData, status, triggeredParameters: triggeredParameters || [] },
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
    try {
        console.log('[SCHEDULER] Surveillance data collection triggered');
        const db = require('../db/database');
        const allEquipment = await db.getAllEquipment({ limit: 10000, isActive: true });
        const equipmentList = allEquipment.data || allEquipment;
        
        const surveillanceEquipment = equipmentList.filter((item: any) => {
            const config = item.snmpConfig || item.snmp_config;
            return item.category === 'Surveillance' && config && config.enabled && 
                   (config.method === 'asterix' || config.method === 'adsb');
        });

        for (const item of surveillanceEquipment) {
            try {
                const config = item.snmpConfig || item.snmp_config;
                if (config.method === 'asterix' && RadarReceiver) {
                    const result = await RadarReceiver.fetchData(item.id);
                    const status = result.targets && result.targets.length > 0 ? 'Normal' : 'No Targets';
                    await db.updateEquipmentStatus(item.id, status);
                    await db.createEquipmentLog({
                        equipmentId: item.id,
                        data: { 
                            status,
                            receiverStatus: result.status,
                            targetsCount: result.targets ? result.targets.length : 0,
                            lastTarget: result.targets && result.targets.length > 0 ? result.targets[0] : null,
                            stationName: item.name,
                            stationCode: item.code
                        },
                        source: 'asterix'
                    });
                } else if (config.method === 'adsb' && AdsbReceiver) {
                     const result = await AdsbReceiver.fetchData(item.id);
                     const status = result.aircraft && result.aircraft.length > 0 ? 'Normal' : 'No Targets';
                     await db.updateEquipmentStatus(item.id, status);
                     await db.createEquipmentLog({
                         equipmentId: item.id,
                         data: {
                             status,
                             receiverStatus: result.status,
                             aircraftCount: result.aircraft ? result.aircraft.length : 0,
                             stationName: item.name
                         },
                         source: 'adsb'
                     });
                }
            } catch (err: any) {
                console.error(`[SCHEDULER-SURVEILLANCE] Error for ${item.name}:`, err.message);
            }
        }
    } catch (error) {
        console.error('[SCHEDULER-SURVEILLANCE] Error:', error);
    }
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

// --- HELPER FUNCTIONS ---
function getAirportStatus(airportId: number, equipmentList: any[]) {
    if (!equipmentList || equipmentList.length === 0) return 'Normal';
    if (equipmentList.some(e => e.status === 'Alert')) return 'Alert';
    if (equipmentList.some(e => e.status === 'Warning')) return 'Warning';
    if (equipmentList.some(e => e.status === 'Disconnect')) return 'Disconnect';
    return 'Normal';
}

function getEquipmentCountByCategory(equipmentList: any[]) {
    return {
        Communication: equipmentList?.filter(e => e.category === 'Communication').length || 0,
        Navigation: equipmentList?.filter(e => e.category === 'Navigation').length || 0,
        Surveillance: equipmentList?.filter(e => e.category === 'Surveillance').length || 0,
        'Data Processing': equipmentList?.filter(e => e.category === 'Data Processing').length || 0,
        Support: equipmentList?.filter(e => e.category === 'Support').length || 0
    };
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
    
    // Web Application SEO & Aesthetics Implementation
    // This server serves the modern Bun/Elysia backend and the static TOC frontend
    
    // --- GLOBAL ERROR HANDLER ---
    .onError(({ code, error, set }) => {
        if (code === 'NOT_FOUND') {
            set.status = 404;
            return { 
                success: false, 
                message: 'Endpoint NOT_FOUND. Pastikan URL dan Method (GET/POST) sudah benar.', 
                error: 'Route not found in Elysia'
            };
        }
        console.error(`[SERVER-ERROR] ${code}:`, error);
        set.status = 500;
        return { success: false, message: (error as any).message || 'Internal Server Error' };
    })

    // --- MIDDLEWARE & PLUGINS ---
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
                    const user = await db.findUserByUsername(username);
                    if (!user) {
                        set.status = 401;
                        return { message: 'User tidak ditemukan' };
                    }

                    const isPasswordMatch = await bcrypt.compare(password, user.password);
                    if (!isPasswordMatch) {
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

    // Public Equipment Stats
    .get('/api/equipment/stats', async () => {
        try {
            const stats = await db.getEquipmentStatsSummary();
            
            let normal = 0, warning = 0, alert = 0, disconnect = 0;
            if (stats && Array.isArray(stats.statuses)) {
                stats.statuses.forEach((row: any) => {
                    if (row.status === 'Normal') normal = parseInt(row.count);
                    if (row.status === 'Warning') warning = parseInt(row.count);
                    if (row.status === 'Alert') alert = parseInt(row.count);
                    if (row.status === 'Disconnect') disconnect = parseInt(row.count);
                });
            }
            
            const categories: any = {
                Communication: 0, Navigation: 0, Surveillance: 0, 'Data Processing': 0, Support: 0
            };
            if (stats && Array.isArray(stats.categories)) {
                stats.categories.forEach((row: any) => {
                    if (categories[row.category] !== undefined) {
                        categories[row.category] = parseInt(row.count);
                    }
                });
            }
            
            return {
                total: stats?.total || 0,
                normal,
                warning,
                alert,
                disconnect,
                byCategory: categories
            };
        } catch (error: any) {
            console.error('[API] Error fetching equipment stats:', error);
            return {
                total: 0, normal: 0, warning: 0, alert: 0, disconnect: 0,
                byCategory: { Communication: 0, Navigation: 0, Surveillance: 0, 'Data Processing': 0, Support: 0 }
            };
        }
    })

    // Public Airports Data (Required for Public Dashboard)
    .get('/api/airports', async () => {
        const airports = await db.getAllAirports();
        const allEquipment = await db.getAllEquipment({ limit: 10000, isActive: 'all' });
        const equipmentData = allEquipment.data || allEquipment;

        return airports.map((airport: any) => {
            const airportId = airport.id;
            const airportEquipment = equipmentData.filter((e: any) => e.airport_id === airportId || e.branch_id === airportId || e.airportId === airportId || e.branchId === airportId);
            const activeEquipment = airportEquipment.filter((e: any) => e.isActive === true || e.isActive === 'true' || e.is_active === 1 || e.is_active === '1' || e.is_active === true);
            
            return {
                ...airport,
                status: getAirportStatus(airportId, activeEquipment),
                equipmentCount: getEquipmentCountByCategory(airportEquipment),
                activeEquipmentCount: getEquipmentCountByCategory(activeEquipment),
                totalEquipment: airportEquipment.length,
                totalActiveEquipment: activeEquipment.length
            };
        });
    })

    .get('/health', () => ({ status: 'ok', runtime: 'Bun', framework: 'Elysia' }))

    // --- PUBLIC SNMP ROUTES ---
    .get('/api/snmp/templates', async () => {
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
    }, { beforeHandle: () => {} })
    .get('/api/snmp/templates/:id', async ({ params, set }) => {
        const template = await db.getSnmpTemplateById(params.id);
        if (!template) {
            set.status = 404;
            return { message: 'Template not found' };
        }
        return template;
    }, { beforeHandle: () => {} })

    // --- PROTECTED ROUTES ---
    .use(authenticate)

    // --- PING TOOL ROUTES ---
    .group('/api/ping', (app) => 
        app
            .post('/start', async ({ body, set }) => {
                const { ip, interval } = body as any;
                
                if (!ip || !interval) {
                    set.status = 400;
                    return { error: 'IP dan interval wajib diisi' };
                }
                
                const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
                if (!ipRegex.test(ip)) {
                    set.status = 400;
                    return { error: 'Format IP tidak valid' };
                }
                
                if (interval < 1 || interval > 60) {
                    set.status = 400;
                    return { error: 'Interval harus antara 1-60 detik' };
                }
                
                // Clear existing
                if (state.ping.interval) {
                    clearInterval(state.ping.interval);
                    state.ping.results = [];
                }
                
                state.ping.currentIp = ip;
                const intervalMs = interval * 1000;
                
                try {
                    // Initial ping
                    const { ping } = require('./utils/network');
                    const result = await ping.promise.probe(ip, { timeout: 5 });
                    
                    state.ping.results.push({
                        time: new Date().toISOString(),
                        alive: result.alive,
                        responseTime: result.time,
                        host: ip
                    });
                    
                    // Start interval
                    state.ping.interval = setInterval(async () => {
                        try {
                            const pResult = await ping.promise.probe(ip, { timeout: 5 });
                            state.ping.results.push({
                                time: new Date().toISOString(),
                                alive: pResult.alive,
                                responseTime: pResult.time || 0,
                                host: ip
                            });
                            
                            if (state.ping.results.length > state.ping.maxResults) {
                                state.ping.results = state.ping.results.slice(-state.ping.maxResults);
                            }
                        } catch (e: any) {
                            console.error('[Ping] Error:', e.message);
                        }
                    }, intervalMs);
                    
                    return { 
                        message: `Ping ke ${ip} setiap ${interval} detik dimulai`,
                        ip: ip,
                        interval: interval,
                        status: result.alive ? 'online' : 'offline',
                        responseTime: result.time
                    };
                } catch (error: any) {
                    set.status = 500;
                    return { error: error.message };
                }
            })
            .post('/stop', () => {
                if (state.ping.interval) {
                    clearInterval(state.ping.interval);
                    state.ping.interval = null;
                    
                    const result = {
                        message: 'Ping dihentikan',
                        ip: state.ping.currentIp,
                        results: state.ping.results.length
                    };
                    
                    state.ping.currentIp = null;
                    return result;
                }
                return { message: 'Tidak ada ping aktif' };
            })
            .get('/status', () => {
                return {
                    active: state.ping.interval !== null,
                    ip: state.ping.currentIp,
                    results: state.ping.results,
                    totalResults: state.ping.results.length
                };
            })
            .get('/results', () => {
                return {
                    ip: state.ping.currentIp,
                    active: state.ping.interval !== null,
                    results: state.ping.results
                };
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
                const { pingTiered } = require('./utils/network');
                try {
                    const result = await pingTiered(params.id);
                    if (!result.success && result.tier === 0) { // Error
                         set.status = 500;
                         return result;
                    }
                    return result;
                } catch (error: any) {
                    set.status = 500;
                    return { message: error.message };
                }
            })
            // Manual Ping Test (Custom IP)
            .post('/ping', async ({ body, set }) => {
                const { pingHost, isValidIP } = require('./utils/network');
                try {
                    const { ip } = body as any;
                    if (!ip || !isValidIP(ip)) {
                        set.status = 400;
                        return { success: false, message: 'Invalid IP address format' };
                    }
                    
                    const result = await pingHost(ip, 3);
                    return {
                        success: result.alive,
                        ip: ip,
                        status: result.alive ? 'online' : 'offline',
                        statistics: result.alive ? { avg: result.avg } : null,
                        timestamp: new Date().toISOString()
                    };
                } catch (error: any) {
                    set.status = 500;
                    return { success: false, message: error.message };
                }
            })
    )

    // --- AIRPORT ROUTES ---
    .group('/api/airports', (app) =>
        app
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
            .post('/templates', async ({ body, set }) => {
                try {
                    const id = 'custom_' + Date.now();
                    const newTemplate = await db.createSnmpTemplate({ ...(body as any), id, isDefault: false });
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
            .get('/data/:id', async ({ params, set }) => {
                const { fetchAndParseData } = require('./utils/network');
                try {
                    const item = await db.getEquipmentById(params.id);
                    if (!item) {
                        set.status = 404;
                        return { message: 'Equipment not found' };
                    }
                    
                    const config = item.snmpConfig || item.snmp_config;
                    if (!config || !config.enabled) {
                        set.status = 404;
                        return { message: 'SNMP not configured for this equipment' };
                    }
                    
                    const { parsedData: data, status, triggeredParameters } = await fetchAndParseData(item);
                    const enrichedData = { ...data, _status: status, _triggered: triggeredParameters || [] };
                    state.snmpDataCache[item.id] = enrichedData;
                    return enrichedData;
                } catch (error: any) {
                    console.error(`[SNMP] Error for ${params.id}:`, error.message);
                    if (state.snmpDataCache[params.id]) {
                        return { ...state.snmpDataCache[params.id], error: error.message, cached: true };
                    }
                    set.status = 500;
                    return { message: 'Failed to fetch SNMP data', error: error.message };
                }
            })
    )
    
// --- AIRPORTS ROUTES (Gateway Status) ---
    .group('/api/airports', (app) => 
      app
        .get('/gateway-status', async ({ query: { airportId }, set }) => {
          try {
            if (!airportId) {
              set.status = 400;
              return { success: false, error: 'airportId query parameter required' };
            }
            const airportIdNum = parseInt(airportId as string);
            const airportQuery = 'SELECT id, name, ip_branch FROM airports WHERE id = ?';
            const airports = await db.query(airportQuery, [airportIdNum]);
            
            if (!airports || airports.length === 0) {
              set.status = 404;
              return { 
                success: false, 
                error: 'Airport not found',
                gatewayHealthy: false 
              };
            }
            
            const airport = airports[0];
            const gatewayIp = airport.ip_branch;
            
            if (!gatewayIp || gatewayIp.trim() === '') {
              return { 
                success: true,
                gatewayHealthy: false,
                ip: null,
                message: 'No gateway IP configured for this airport',
                responseTime: null
              };
            }
            
            // Ping gateway IP (timeout 3s)
            const ping = require('ping');
            const result = await ping.promise.probe(gatewayIp, { timeout: 3 });
            
            const gatewayHealthy = result.alive;
            
            return {
              success: true,
              gatewayHealthy,
              ip: gatewayIp,
              responseTime: gatewayHealthy ? result.time : null,
              message: gatewayHealthy ? 'Gateway reachable' : 'Gateway unreachable',
              airport: {
                id: airport.id,
                name: airport.name
              }
            };
          } catch (error) {
            console.error('[Gateway Status] Error:', error);
            set.status = 500;
            return {
              success: false,
              error: 'Internal server error',
              gatewayHealthy: false
            };
          }
        })
    )

    // --- SURVEILLANCE ROUTES ---
    .group('/api/surveillance', (app) =>
        app
            .get('/stations', async ({ query }) => {
                const { type, airportId, isActive } = query;
                const filters: any = {};
                if (type) filters.type = type;
                if (airportId) filters.airportId = parseInt(airportId as string);
                if (isActive !== undefined) filters.isActive = isActive === 'true';
                return await db.getAllSurveillanceStations(filters);
            })
            .get('/stations/:id', async ({ params, set }) => {
                const station = await db.getSurveillanceStationById(params.id);
                if (!station) {
                    set.status = 404;
                    return { message: 'Station not found' };
                }
                return station;
            })
            .post('/stations', async ({ body, set }) => {
                const b = body as any;
                const station = await db.createSurveillanceStation({
                    ...b,
                    port: parseInt(b.port),
                    lat: b.lat ? parseFloat(b.lat) : null,
                    lng: b.lng ? parseFloat(b.lng) : null,
                    airportId: b.airportId ? parseInt(b.airportId) : null
                });
                set.status = 201;
                return station;
            }, { beforeHandle: authorize(['admin', 'user_pusat']) })
            .put('/stations/:id', async ({ params, body, set }) => {
                const b = body as any;
                const station = await db.updateSurveillanceStation(params.id, {
                    ...b,
                    port: b.port ? parseInt(b.port) : undefined,
                    lat: b.lat ? parseFloat(b.lat) : undefined,
                    lng: b.lng ? parseFloat(b.lng) : undefined,
                    airportId: b.airportId ? parseInt(b.airportId) : undefined
                });
                if (!station) {
                    set.status = 404;
                    return { message: 'Station not found' };
                }
                return station;
            }, { beforeHandle: authorize(['admin', 'user_pusat']) })
            .delete('/stations/:id', async ({ params }) => {
                await db.deleteSurveillanceStation(params.id);
                return { message: 'Station deleted' };
            }, { beforeHandle: authorize(['admin']) })
            .get('/radar/:stationId', async ({ params, query }) => {
                const { limit = 100 } = query;
                return await db.getRadarTargets(parseInt(params.stationId), {
                    limit: parseInt(limit as string)
                });
            })
            .get('/adsb', async ({ query }) => {
                const { limit = 500 } = query;
                return await db.getAdsbAircraft({
                    limit: parseInt(limit as string)
                });
            })
            .get('/status', async () => {
                const stations = await db.getAllSurveillanceStations({});
                const radarStations = stations.filter((s: any) => s.type === 'radar');
                const adsbStations = stations.filter((s: any) => s.type === 'adsb');
                
                const radarTargets = await db.getRadarTargets(1, { limit: 1000 });
                const adsbAircraft = await db.getAdsbAircraft({ limit: 1000 });
                
                return {
                    radar: {
                        totalStations: radarStations.length,
                        activeStations: radarStations.filter((s: any) => s.isActive).length,
                        totalTargets: radarTargets.length
                    },
                    adsb: {
                        totalStations: adsbStations.length,
                        activeStations: adsbStations.filter((s: any) => s.isActive).length,
                        totalAircraft: adsbAircraft.length
                    },
                    stations: stations
                };
            })
            .post('/fetch-asterix', async ({ body, set }) => {
                const { stationId } = body as any;
                const station = await db.getSurveillanceStationById(stationId);
                if (!station) {
                    set.status = 404;
                    return { message: 'Station not found' };
                }
                
                let targets = [];
                let receiverStatus = 'disconnected';
                
                if (radarReceiver) {
                    try {
                        const result = await radarReceiver.fetchData(station.id);
                        targets = result.targets || [];
                        receiverStatus = result.status;
                    } catch (err: any) {
                        console.error('[API] Error fetching from radar receiver:', err.message);
                    }
                }
                
                if (targets.length === 0) {
                    targets = await db.getRadarTargets(station.id, { limit: 50 });
                }
                
                return {
                    station,
                    targets,
                    receiverStatus,
                    timestamp: new Date().toISOString()
                };
            })
            .get('/logs', async ({ query }) => {
                const { stationId, logType, severity, page = 1, limit = 100 } = query;
                const filters: any = {};
                if (stationId) filters.stationId = parseInt(stationId as string);
                if (logType) filters.logType = logType;
                if (severity) filters.severity = severity;
                filters.page = parseInt(page as string);
                filters.limit = parseInt(limit as string);
                return await db.getSurveillanceLogs(filters);
            })
    )

    // --- USER MANAGEMENT ROUTES ---
    .group('/api/users', (app) =>
        app
            .use(authenticate)
            .get('/', async ({ query, set }) => {
                try {
                    const { search } = query;
                    const users = await db.getAllUsers({ search });
                    return users;
                } catch (error: any) {
                    set.status = 500;
                    return { message: error.message };
                }
            }, { beforeHandle: authorize(['admin', 'user_pusat']) })
            .get('/:id', async ({ params, set }) => {
                try {
                    const user = await db.getUserById(params.id);
                    if (!user) {
                        set.status = 404;
                        return { message: 'User not found' };
                    }
                    return user;
                } catch (error: any) {
                    set.status = 500;
                    return { message: error.message };
                }
            }, { beforeHandle: authorize(['admin', 'user_pusat']) })
            .post('/', async ({ body, set }) => {
                try {
                    let { username, password, name, role, branchId } = body as any;
                    
                    if (!username || !name || !role) {
                        set.status = 400;
                        return { message: 'Username, Name, and Role are required' };
                    }
                    
                    if (!password) {
                        password = Math.random().toString(36).substring(2, 10);
                    }
                    
                    const hashedPassword = await bcrypt.hash(password, saltRounds);
                    
                    const newUser = await db.createUser({
                        username,
                        password: hashedPassword,
                        name,
                        role,
                        branchId: branchId || null
                    });
                    
                    set.status = 201;
                    return { ...newUser, tempPassword: !(body as any).password ? password : undefined };
                } catch (error: any) {
                    if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
                        set.status = 400;
                        return { message: 'Username already exists' };
                    }
                    set.status = 500;
                    return { message: error.message };
                }
            }, { beforeHandle: authorize(['admin']) })
            .put('/:id', async ({ params, body, set, user }) => {
                try {
                    const targetUser = await db.getUserById(params.id);
                    if (!targetUser) {
                        set.status = 404;
                        return { message: 'User not found' };
                    }
                    
                    if (targetUser.role === 'admin' && user.role !== 'admin') {
                        set.status = 403;
                        return { message: 'Cannot modify admin user' };
                    }
                    
                    const { username, name, role, branchId, password } = body as any;
                    
                    if (username === "" || name === "" || role === "") {
                        set.status = 400;
                        return { message: 'Username, Name, and Role cannot be empty' };
                    }
                    
                    const updateData: any = { username, name, role, branchId };
                    
                    if (password) {
                        updateData.password = await bcrypt.hash(password, saltRounds);
                    }
                    
                    const updated = await db.updateUser(params.id, updateData);
                    return updated;
                } catch (error: any) {
                    if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
                        set.status = 400;
                        return { message: 'Username already exists' };
                    }
                    set.status = 500;
                    return { message: error.message };
                }
            }, { beforeHandle: authorize(['admin', 'user_pusat']) })
            .delete('/:id', async ({ params, set }) => {
                try {
                    await db.deleteUser(params.id);
                    return { message: 'User deleted' };
                } catch (error: any) {
                    set.status = 500;
                    return { message: error.message };
                }
            }, { beforeHandle: authorize(['admin']) })
    )

    // --- THRESHOLD ROUTES ---
    .group('/api/equipment/:id/thresholds', (app) =>
        app
            .get('/', async ({ params }) => await db.getThresholdsByEquipment(params.id))
            .post('/', async ({ params, body, set }) => {
                const threshold = await db.createThreshold({ ...(body as any), equipment_id: parseInt(params.id) });
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
    .group('/api/network', app => app.use(authenticate))
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
    .group('/api/sniffer', app => app.use(authenticate))
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
        if (RadarReceiver && AdsbReceiver) {
            console.log('[SURVEILLANCE] Initializing Radar and ADS-B receivers...');
            
            radarReceiver = new RadarReceiver({
                dataDir: './data',
                onData: (type: string, station: any, data: any) => {
                    console.log(`[SURVEILLANCE] Radar data from ${station.name}`);
                },
                onError: (station: any, error: any) => {
                    console.error(`[SURVEILLANCE] Radar error for ${station.name}:`, error.message);
                }
            });
            
            adsbReceiver = new AdsbReceiver({
                dataDir: './data',
                onData: (station: any, aircraft: any) => {
                    // console.log(`[SURVEILLANCE] ADS-B data from ${station.name}`);
                }
            });

            if (radarReceiver.startAll) radarReceiver.startAll();
            if (adsbReceiver.start) adsbReceiver.start();
            
            console.log('[SURVEILLANCE] Receivers started');
        }

        console.log('[SYSTEM] All services initialized successfully');
    } catch (err) {
        console.error('[SYSTEM] Error during service initialization:', err);
    }
}

startServices();

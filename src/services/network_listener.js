/**
 * Network Listener Service
 * Manages persistent UDP/TCP listeners for equipment data sources
 */

const ParserFactory = require('../parsers/factory');
const connectionManager = require('../connection/manager');
const db = require('../../db/database');
const EquipmentService = require('./equipment');

class NetworkListenerService {
    constructor() {
        this.equipmentService = new EquipmentService(db);
        this.activeListeners = new Set(); // source_id -> true
    }

    /**
     * Initialize listeners for all active equipment sources
     */
    async initialize() {
        console.log('[NetworkListener] Initializing listeners...');
        
        try {
            // Fetch all equipment sources (authentications)
            const sources = await db.getAllOtentication();
            console.log(`[NetworkListener] Found ${sources.length} total sources`);

            for (const source of sources) {
                // Check if it has connection details
                if (source.udp_port || source.tcp_port) {
                    await this.startListener(source);
                }
            }

            console.log(`[NetworkListener] Finished initializing ${this.activeListeners.size} active listeners`);
        } catch (error) {
            console.error('[NetworkListener] Initialization error:', error);
        }
    }

    /**
     * Start a listener for a specific source
     * @param {Object} source - Source configuration from database
     */
    async startListener(source) {
        const { id, equipt_id, ip_address, udp_port, tcp_port, parsing_id } = source;
        const port = parseInt(udp_port || tcp_port);
        const protocol = udp_port ? 'udp' : 'tcp';

        if (isNaN(port)) {
            console.warn(`[NetworkListener] Invalid port for source ${id}: ${udp_port || tcp_port}`);
            return;
        }

        console.log(`[NetworkListener] Starting ${protocol.toUpperCase()} listener for ${source.name} on port ${port}...`);

        // 1. Create Parser
        let parser = null;
        if (parsing_id) {
            // Use parsing_id as connectionType for factory
            parser = ParserFactory.createParser(parsing_id, { equipt_id });
        }

        if (!parser) {
            console.warn(`[NetworkListener] No valid parser found for parsing_id: ${parsing_id}. Data will be logged as raw.`);
        }

        // 2. Bind Socket
        const onData = async (rawData) => {
            await this.handleIncomingData(source, rawData, parser);
        };

        const onError = (error) => {
            console.error(`[NetworkListener] Error for source ${source.name} (${id}):`, error.message);
        };

        let success = false;
        if (protocol === 'udp') {
            success = connectionManager.connectUDP(id, ip_address || '0.0.0.0', port, onData, onError);
        } else {
            success = await connectionManager.connectTCP(id, ip_address || '0.0.0.0', port, onData, onError);
        }

        if (success) {
            this.activeListeners.add(id);
            console.log(`[NetworkListener] ${protocol.toUpperCase()} listener active for ${source.name} on port ${port}`);
        } else {
            console.error(`[NetworkListener] Failed to start listener for ${source.name} on port ${port}`);
        }
    }

    /**
     * Handle incoming raw data
     */
    async handleIncomingData(source, rawData, parser) {
        const { id, equipt_id, name } = source;
        console.log(`[NetworkListener] Received data from ${name} (${rawData.length} bytes)`);

        try {
            let parsedResult = { success: false };
            let status = 'Normal';

            if (parser) {
                parsedResult = parser.parse(rawData);
            }

            // Save to logs
            const logData = {
                ...(parsedResult.success ? parsedResult : { success: false, data: { raw: rawData.toString('hex') }, error: 'Parsing failed or no parser' }),
                source: name, // Set the source name (e.g., "TX 1")
                _ip: source.ip_address || 'unknown' // For FileLogger
            };
            
            await this.equipmentService.saveToLogs(
                equipt_id, 
                logData, 
                source.parsing_id || 'raw', 
                parsedResult.status || 'Normal'
            );

            if (parsedResult.success) {
                console.log(`[NetworkListener] Successfully parsed data for ${name}. Status: ${parsedResult.status}`);
                // Status is now handled by the watchdog consolidation in server.ts
                // await this.equipmentService.updateEquipmentStatus(equipt_id, parsedResult.status || 'Normal');
            } else {
                console.warn(`[NetworkListener] Parsing failed for ${name}: ${parsedResult.error}`);
            }

        } catch (error) {
            console.error(`[NetworkListener] Error processing data for ${name}:`, error.message);
        }
    }

    /**
     * Stop all listeners
     */
    stopAll() {
        console.log('[NetworkListener] Stopping all listeners...');
        for (const sourceId of this.activeListeners) {
            connectionManager.disconnect(sourceId);
        }
        this.activeListeners.clear();
    }
}

// Singleton instance
const networkListenerService = new NetworkListenerService();

module.exports = networkListenerService;

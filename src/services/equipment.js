/**
 * Equipment Service
 * Handles equipment data collection, parsing, and database operations
 */

const ParserFactory = require('../parsers/factory');
const connectionManager = require('../connection/manager');

class EquipmentService {
    constructor(db) {
        this.db = db;
        this.activeCollectors = new Map(); // equipment_id -> collector interval
        this.parsers = new Map(); // equipment_id -> parser instance
    }

    /**
     * Get equipment with connection config
     * @param {number} equipmentId - Equipment ID
     * @returns {Promise<Object|null>} Equipment data
     */
    async getEquipmentWithConfig(equipmentId) {
        try {
            const query = `
                SELECT e.*, ec.id as connect_id, ec.connection_type, ec.protocol,
                       ec.host, ec.port, ec.rcms_format, ec.parser_config,
                       ec.threshold_overrides, ec.is_enabled as connect_enabled,
                       et.name as template_name, et.parser_config as template_parser_config
                FROM equipment e
                LEFT JOIN equipment_connect ec ON ec.equipment_id = e.id AND ec.is_enabled = TRUE
                LEFT JOIN equipment_templates et ON ec.parser_config LIKE CONCAT('%', et.name, '%')
                WHERE e.id = ? AND e.is_active = TRUE
            `;
            
            const results = await this.db.query(query, [equipmentId]);
            return results[0] || null;
        } catch (error) {
            console.error('[EquipmentService] Error getting equipment:', error);
            return null;
        }
    }

    /**
     * Get all active equipment with connection config
     * @returns {Promise<Array>} Equipment list
     */
    async getAllActiveEquipment() {
        try {
            const query = `
                SELECT e.*, ec.id as connect_id, ec.connection_type, ec.protocol,
                       ec.host, ec.port, ec.rcms_format, ec.parser_config,
                       ec.threshold_overrides, ec.is_enabled as connect_enabled
                FROM equipment e
                LEFT JOIN equipment_connect ec ON ec.equipment_id = e.id AND ec.is_enabled = TRUE
                WHERE e.is_active = TRUE
                ORDER BY e.airport_id, e.category, e.name
            `;
            
            return await this.db.query(query);
        } catch (error) {
            console.error('[EquipmentService] Error getting active equipment:', error);
            return [];
        }
    }

    /**
     * Get equipment templates
     * @param {string} equipmentType - Equipment type filter
     * @returns {Promise<Array>} Template list
     */
    async getTemplates(equipmentType = null) {
        try {
            let query = 'SELECT * FROM equipment_templates WHERE is_active = TRUE';
            const params = [];
            
            if (equipmentType) {
                query += ' AND equipment_type = ?';
                params.push(equipmentType);
            }
            
            query += ' ORDER BY equipment_type, name';
            
            return await this.db.query(query, params);
        } catch (error) {
            console.error('[EquipmentService] Error getting templates:', error);
            return [];
        }
    }

    /**
     * Create parser for equipment
     * @param {Object} equipment - Equipment with connection config
     * @returns {Object|null} Parser instance
     */
    createParser(equipment) {
        if (!equipment.connection_type || !equipment.parser_config) {
            console.warn(`[EquipmentService] No parser config for equipment ${equipment.id}`);
            return null;
        }

        try {
            // Merge template config with connection config
            let parserConfig = equipment.parser_config;
            
            // If parser_config is string, parse it
            if (typeof parserConfig === 'string') {
                parserConfig = JSON.parse(parserConfig);
            }

            const config = {
                ...equipment,
                parser_config: parserConfig
            };

            return ParserFactory.createParser(equipment.connection_type, config);
        } catch (error) {
            console.error(`[EquipmentService] Error creating parser:`, error);
            return null;
        }
    }

    /**
     * Collect data from single equipment
     * @param {number} equipmentId - Equipment ID
     * @returns {Promise<Object>} Collection result
     */
async collectFromEquipment(equipmentId) {
        const equipment = await this.getEquipmentWithConfig(equipmentId);
        
        if (!equipment) {
            return { success: false, error: 'Equipment not found or inactive' };
        }

        if (!equipment.connect_enabled || !equipment.host || !equipment.port) {
            return { success: false, error: 'No active connection config' };
        }

        try {
            // ✅ NEW: Step 2.3 - Gateway-First Authentication
            if (equipment.airport && equipment.airport.ip_branch && !equipment.bypassGateway) {
                console.log(`[EquipmentService] Pinging gateway ${equipment.airport.ip_branch} for equipment ${equipment.id}`);
                const gwTest = await connectionManager.testConnection(equipment.airport.ip_branch, 80, 3000); // 3s timeout
                
                if (!gwTest.success) {
                    console.warn(`[EquipmentService] Gateway DOWN for equipment ${equipment.id}: ${gwTest.message}`);
                    await this.updateEquipmentStatus(equipmentId, 'Disconnect', `Gateway ${equipment.airport.ip_branch} unreachable`);
                    return { success: false, error: `Gateway unreachable: ${gwTest.message}`, tier: 'gateway' };
                }
            }

            // Test direct equipment connection
            const connTest = await connectionManager.testConnection(equipment.host, equipment.port);
            
            if (!connTest.success) {
                // Log connection failure
                await this.logConnection(equipmentId, equipment.connect_id, 'timeout', connTest.responseTime, connTest.message);
                
                // Update status
                await this.updateEquipmentStatus(equipmentId, 'Disconnect', connTest.message);
                
                return {
                    success: false,
                    error: connTest.message,
                    connectionStatus: 'Disconnect'
                };
            }

            // Connection successful - now try to get data
            // For now, we'll do a simple approach: connect, request data, parse
            // In production, this would be more sophisticated
            
            // For RCMS, typically you send a request command and wait for response
            // Let's simulate getting data
            
            // Update status to connected
            await this.updateEquipmentStatus(equipmentId, 'Normal', null, 'Connected');

            return {
                success: true,
                connectionStatus: 'Connected',
                responseTime: connTest.responseTime,
                equipmentId
            };

        } catch (error) {
            console.error(`[EquipmentService] Collection error:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update equipment status in database
     * @param {number} equipmentId - Equipment ID
     * @param {string} status - Status (Normal, Warning, Alarm, Disconnect)
     * @param {string} error - Error message if any
     * @param {string} connectionStatus - Connection status
     */
    async updateEquipmentStatus(equipmentId, status, error = null, connectionStatus = 'Disconnect') {
        try {
            // Check if status record exists
            const checkQuery = 'SELECT id FROM equipment_status WHERE equipment_id = ?';
            const existing = await this.db.query(checkQuery, [equipmentId]);
            
            const statusData = {
                equipment_id: equipmentId,
                status: status,
                status_detail: error,
                connection_status: connectionStatus,
                status_since: status === 'Normal' || status === 'Warning' || status === 'Alarm' ? new Date() : null,
                last_connected: connectionStatus === 'Connected' ? new Date() : null,
                last_error: error,
                last_updated: new Date()
            };

            if (existing.length > 0) {
                // Update
                const updateQuery = `
                    UPDATE equipment_status 
                    SET status = ?, status_detail = ?, connection_status = ?,
                        status_since = COALESCE(status_since, ?),
                        last_connected = COALESCE(last_connected, ?),
                        last_error = ?, last_updated = ?
                    WHERE equipment_id = ?
                `;
                await this.db.query(updateQuery, [
                    statusData.status, statusData.status_detail, statusData.connection_status,
                    statusData.status_since, statusData.last_connected, statusData.last_error,
                    statusData.last_updated, equipmentId
                ]);
            } else {
                // Insert
                const insertQuery = `
                    INSERT INTO equipment_status 
                    (equipment_id, status, status_detail, connection_status, status_since, last_connected, last_error, last_updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `;
                await this.db.query(insertQuery, [
                    equipmentId, statusData.status, statusData.status_detail, statusData.connection_status,
                    statusData.status_since, statusData.last_connected, statusData.last_error, statusData.last_updated
                ]);
            }
        } catch (error) {
            console.error('[EquipmentService] Error updating status:', error);
        }
    }

    /**
     * Log connection test result
     * @param {number} equipmentId - Equipment ID
     * @param {number} connectId - Connection ID
     * @param {string} result - Test result
     * @param {number} responseTime - Response time in ms
     * @param {string} error - Error message if any
     */
    async logConnection(equipmentId, connectId, result, responseTime, error = null) {
        try {
            const query = `
                INSERT INTO connection_logs 
                (equipment_id, connect_id, test_result, response_time, error_message, tested_at)
                VALUES (?, ?, ?, ?, ?, NOW())
            `;
            await this.db.query(query, [equipmentId, connectId, result, responseTime, error]);
        } catch (error) {
            console.error('[EquipmentService] Error logging connection:', error);
        }
    }

    /**
     * Get the most recent parsed_data from equipment_logs
     * @param {number} equipmentId
     * @returns {Object|null} Parsed data object or null if none
     */
    async getLastParsedLog(equipmentId) {
        try {
            const query = `
                SELECT parsed_data 
                FROM equipment_logs 
                WHERE equipment_id = ? 
                ORDER BY logged_at DESC 
                LIMIT 1
            `;
            const results = await this.db.query(query, [equipmentId]);
            if (!results || results.length === 0) return null;
            const parsed = results[0].parsed_data;
            if (typeof parsed === 'string') {
                try {
                    return JSON.parse(parsed);
                } catch (_err) {
                    return null;
                }
            }
            return parsed;
        } catch (error) {
            console.error('[EquipmentService] Error fetching last parsed log:', error);
            return null;
        }
    }

    async getEquipmentMeta(equipmentId) {
        try {
            const query = `
                SELECT e.name as equipment_name, e.status as equipment_status,
                       a.name as airport_name, a.city as airport_city
                FROM equipment e
                LEFT JOIN airports a ON e.airport_id = a.id
                WHERE e.id = ?
                LIMIT 1
            `;
            const results = await this.db.query(query, [equipmentId]);
            if (!results || results.length === 0) return {};
            return results[0];
        } catch (error) {
            console.error('[EquipmentService] Error fetching equipment metadata:', error);
            return {};
        }
    }

    /**
     * Compute changes between two parsed data snapshots
     * @param {Object} previous
     * @param {Object} current
     * @returns {Object} Map of changed keys with old/new values
     */
    computeParsedChanges(previous = {}, current = {}) {
        const changes = {};
        const keys = new Set([...(previous ? Object.keys(previous) : []), ...(current ? Object.keys(current) : [])]);

        for (const key of keys) {
            const oldVal = previous ? previous[key] : undefined;
            const newVal = current ? current[key] : undefined;

            const oldJson = JSON.stringify(oldVal);
            const newJson = JSON.stringify(newVal);
            if (oldJson !== newJson) {
                changes[key] = { old: oldVal, new: newVal };
            }
        }

        return changes;
    }

    /**
     * Save parsed data to logs with filtering and quality checks
     * @param {number} equipmentId - Equipment ID
     * @param {Object} parsedData - Parsed data
     * @param {string} connectionType - Connection type
     * @param {string} status - Status
     * @param {Object} config - Equipment config with filtering rules
     */
    async saveToLogs(equipmentId, parsedData, connectionType = 'rcms', status = 'Normal', config = {}) {
        try {
            const lastParsed = await this.getLastParsedLog(equipmentId);
            const changes = this.computeParsedChanges(lastParsed?.data || {}, parsedData.data || {});

            // Apply data filtering based on config
            const filteringResult = this.applyDataFiltering(parsedData.data, config);
            const dataQuality = filteringResult.quality;
            const filteredData = filteringResult.data;
            const thresholdApplied = filteringResult.thresholdApplied;

            // Only save if data passes quality check or is marked for logging anyway
            if (dataQuality === 'filtered' && !config.logFilteredData) {
                console.log(`[EquipmentService] Data filtered out for equipment ${equipmentId}`);
                return;
            }

            const equipmentMeta = await this.getEquipmentMeta(equipmentId);

            const parsedForStorage = {
                ...parsedData,
                _changes: changes,
                _filtered: filteringResult.filteredFields
            };

            const query = `
                INSERT INTO equipment_logs
                (equipment_id, equipment_name, status, data, source, raw_data, parsed_data, connection_type, status_detail, airport_name, airport_city, changes, data_quality, threshold_applied, logged_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `;

            await this.db.query(query, [
                equipmentId,
                equipmentMeta.equipment_name || null,
                status,
                JSON.stringify(filteredData || {}),
                parsedData.source || 'snmp',
                parsedData.raw || null,
                JSON.stringify(parsedForStorage),
                connectionType,
                parsedData.status_detail || null,
                equipmentMeta.airport_name || null,
                equipmentMeta.airport_city || null,
                JSON.stringify(changes),
                dataQuality,
                thresholdApplied
            ]);
        } catch (error) {
            console.error('[EquipmentService] Error saving to logs:', error);
        }
    }

    /**
     * Apply data filtering rules before logging
     * @param {Object} data - Parsed data
     * @param {Object} config - Filtering configuration
     * @returns {Object} Filtering result
     */
    applyDataFiltering(data, config) {
        const result = {
            data: { ...data },
            quality: 'valid',
            filteredFields: [],
            thresholdApplied: false
        };

        if (!config.dataFiltering) return result;

        const { dataFiltering } = config;

        // Apply threshold filtering (only log if values change significantly)
        if (dataFiltering.thresholdChangeOnly) {
            const threshold = dataFiltering.changeThreshold || 0.1; // 10% change
            let hasSignificantChange = false;

            for (const [key, value] of Object.entries(data)) {
                if (typeof value === 'number') {
                    const lastValue = this.getLastValue(key);
                    if (lastValue !== null) {
                        const changePercent = Math.abs((value - lastValue) / lastValue);
                        if (changePercent >= threshold) {
                            hasSignificantChange = true;
                            break;
                        }
                    } else {
                        // First value, always log
                        hasSignificantChange = true;
                        break;
                    }
                }
            }

            if (!hasSignificantChange) {
                result.quality = 'filtered';
                result.data = {};
                return result;
            }
        }

        // Apply value range filtering
        if (dataFiltering.valueRanges) {
            for (const [field, range] of Object.entries(dataFiltering.valueRanges)) {
                if (data[field] !== undefined) {
                    const value = data[field];
                    if (range.min !== undefined && value < range.min) {
                        result.filteredFields.push(field);
                        delete result.data[field];
                    } else if (range.max !== undefined && value > range.max) {
                        result.filteredFields.push(field);
                        delete result.data[field];
                    }
                }
            }
        }

        // Apply field filtering (exclude/include specific fields)
        if (dataFiltering.excludeFields) {
            for (const field of dataFiltering.excludeFields) {
                if (result.data[field] !== undefined) {
                    result.filteredFields.push(field);
                    delete result.data[field];
                }
            }
        }

        if (dataFiltering.includeOnlyFields) {
            const includeSet = new Set(dataFiltering.includeOnlyFields);
            for (const field of Object.keys(result.data)) {
                if (!includeSet.has(field)) {
                    result.filteredFields.push(field);
                    delete result.data[field];
                }
            }
        }

        // Mark as filtered if any fields were removed
        if (result.filteredFields.length > 0) {
            result.quality = 'filtered';
        }

        // Check if thresholds were applied
        result.thresholdApplied = !!(dataFiltering.valueRanges || dataFiltering.thresholdChangeOnly);

        return result;
    }

    /**
     * Get last logged value for a field (simple in-memory cache)
     * @param {string} field - Field name
     * @returns {number|null} Last value or null
     */
    getLastValue(field) {
        // Simple implementation - in production, you might want to cache this
        return this.lastValues ? this.lastValues[field] : null;
    }

    /**
     * Update last values cache
     * @param {Object} data - Current data
     */
    updateLastValues(data) {
        if (!this.lastValues) this.lastValues = {};
        Object.assign(this.lastValues, data);
    }

    /**
     * Start continuous data collection for equipment
     * @param {number} equipmentId - Equipment ID
     * @param {number} intervalMs - Collection interval in ms (default 60000 = 1 min)
     */
    startCollector(equipmentId, intervalMs = 60000) {
        // Stop existing collector if any
        this.stopCollector(equipmentId);

        console.log(`[EquipmentService] Starting collector for equipment ${equipmentId} (interval: ${intervalMs}ms)`);
        
        const intervalId = setInterval(async () => {
            await this.collectFromEquipment(equipmentId);
        }, intervalMs);

        this.activeCollectors.set(equipmentId, intervalId);
    }

    /**
     * Stop collector for equipment
     * @param {number} equipmentId - Equipment ID
     */
    stopCollector(equipmentId) {
        const intervalId = this.activeCollectors.get(equipmentId);
        if (intervalId) {
            clearInterval(intervalId);
            this.activeCollectors.delete(equipmentId);
            console.log(`[EquipmentService] Stopped collector for equipment ${equipmentId}`);
        }
    }

    /**
     * Stop all collectors
     */
    stopAllCollectors() {
        for (const equipmentId of this.activeCollectors.keys()) {
            this.stopCollector(equipmentId);
        }
    }

    /**
     * Get collector status
     * @returns {Array} List of active collectors
     */
    getCollectorStatus() {
        const status = [];
        for (const [equipmentId, intervalId] of this.activeCollectors) {
            status.push({ equipmentId, active: true, intervalId });
        }
        return status;
    }
}

module.exports = EquipmentService;

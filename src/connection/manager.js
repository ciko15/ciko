/**
 * Connection Manager
 * Handles TCP/UDP connections to equipment (DME, DVOR, etc.)
 */

const net = require('net');
const dgram = require('dgram');

class ConnectionManager {
    constructor() {
        this.connections = new Map(); // equipment_id -> connection
        this.listeners = new Map();   // equipment_id -> data listener
    }

    /**
     * Connect to equipment via TCP
     * @param {number} equipmentId - Equipment ID
     * @param {string} host - Equipment IP
     * @param {number} port - Equipment port
     * @param {Function} onData - Callback for received data
     * @param {Function} onError - Callback for errors
     * @returns {Promise<boolean>} Connection success
     */
    async connectTCP(equipmentId, host, port, onData, onError) {
        return new Promise((resolve, reject) => {
            // Close existing connection if any
            this.disconnect(equipmentId);

            const socket = new net.Socket();
            socket.setTimeout(10000); // 10 second timeout

            socket.connect(port, host, () => {
                console.log(`[Connection] TCP connected to ${host}:${port} (equipment: ${equipmentId})`);
                this.connections.set(equipmentId, { socket, type: 'tcp', host, port });
                resolve(true);
            });

            socket.on('data', (data) => {
                if (onData) onData(data);
            });

            socket.on('error', (error) => {
                console.error(`[Connection] TCP error for equipment ${equipmentId}:`, error.message);
                if (onError) onError(error);
            });

            socket.on('timeout', () => {
                console.error(`[Connection] TCP timeout for equipment ${equipmentId}`);
                socket.destroy();
                if (onError) onError(new Error('Connection timeout'));
            });

            socket.on('close', () => {
                console.log(`[Connection] TCP disconnected for equipment ${equipmentId}`);
                this.connections.delete(equipmentId);
            });
        });
    }

    /**
     * Connect to equipment via UDP
     * @param {number} equipmentId - Equipment ID
     * @param {string} host - Equipment IP (or multicast IP)
     * @param {number} port - Equipment port
     * @param {Function} onData - Callback for received data
     * @param {Function} onError - Callback for errors
     * @returns {boolean} Success
     */
    connectUDP(equipmentId, host, port, onData, onError) {
        // Close existing connection if any
        this.disconnect(equipmentId);

        try {
            const socket = dgram.createSocket('udp4');
            
            socket.on('message', (msg, rinfo) => {
                if (onData) onData(msg, rinfo);
            });

            socket.on('error', (error) => {
                console.error(`[Connection] UDP error for equipment ${equipmentId}:`, error.message);
                if (onError) onError(error);
            });

            socket.bind(port, () => {
                // If multicast IP, join multicast group
                if (host.startsWith('239.') || host.startsWith('225.')) {
                    try {
                        socket.addMembership(host);
                        console.log(`[Connection] Joined multicast group ${host}`);
                    } catch (e) {
                        console.warn(`[Connection] Could not join multicast: ${e.message}`);
                    }
                }
                console.log(`[Connection] UDP bound to ${port} (equipment: ${equipmentId})`);
            });

            this.connections.set(equipmentId, { socket, type: 'udp', host, port });
            return true;
        } catch (error) {
            console.error(`[Connection] UDP setup failed for equipment ${equipmentId}:`, error.message);
            return false;
        }
    }

    /**
     * Send data to equipment via TCP
     * @param {number} equipmentId - Equipment ID
     * @param {Buffer|string} data - Data to send
     * @returns {Promise<boolean>} Send success
     */
    async send(equipmentId, data) {
        const conn = this.connections.get(equipmentId);
        if (!conn) {
            console.warn(`[Connection] No connection for equipment ${equipmentId}`);
            return false;
        }

        return new Promise((resolve) => {
            if (conn.type === 'tcp') {
                conn.socket.write(data, () => {
                    resolve(true);
                });
            } else {
                // UDP - need to know target
                console.warn(`[Connection] UDP send not implemented - use sendTo`);
                resolve(false);
            }
        });
    }

    /**
     * Send data to equipment via UDP
     * @param {number} equipmentId - Equipment ID
     * @param {Buffer|string} data - Data to send
     * @returns {boolean} Send success
     */
    sendTo(equipmentId, data) {
        const conn = this.connections.get(equipmentId);
        if (!conn || conn.type !== 'udp') {
            console.warn(`[Connection] No UDP connection for equipment ${equipmentId}`);
            return false;
        }

        try {
            const message = Buffer.isBuffer(data) ? data : Buffer.from(data);
            conn.socket.send(message, 0, message.length, conn.port, conn.host);
            return true;
        } catch (error) {
            console.error(`[Connection] UDP send failed:`, error.message);
            return false;
        }
    }

    /**
     * Disconnect equipment
     * @param {number} equipmentId - Equipment ID
     */
    disconnect(equipmentId) {
        const conn = this.connections.get(equipmentId);
        if (conn) {
            try {
                if (conn.type === 'tcp') {
                    conn.socket.destroy();
                } else if (conn.type === 'udp') {
                    conn.socket.close();
                }
            } catch (e) {
                // Ignore close errors
            }
            this.connections.delete(equipmentId);
            console.log(`[Connection] Disconnected equipment ${equipmentId}`);
        }
    }

    /**
     * Disconnect all equipment
     */
    disconnectAll() {
        for (const equipmentId of this.connections.keys()) {
            this.disconnect(equipmentId);
        }
    }

    /**
     * Check if equipment is connected
     * @param {number} equipmentId - Equipment ID
     * @returns {boolean} Connection status
     */
    isConnected(equipmentId) {
        return this.connections.has(equipmentId);
    }

    /**
     * Get connection status
     * @param {number} equipmentId - Equipment ID
     * @returns {Object|null} Connection info
     */
    getStatus(equipmentId) {
        const conn = this.connections.get(equipmentId);
        if (!conn) return null;
        
        return {
            connected: true,
            type: conn.type,
            host: conn.host,
            port: conn.port
        };
    }

    /**
     * Test TCP connection
     * @param {string} host - Host IP
     * @param {number} port - Port
     * @param {number} timeout - Timeout in ms
     * @returns {Promise<Object>} Test result
     */
    async testConnection(host, port, timeout = 5000) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            const startTime = Date.now();
            
            socket.setTimeout(timeout);
            
            socket.connect(port, host, () => {
                const responseTime = Date.now() - startTime;
                socket.destroy();
                resolve({
                    success: true,
                    responseTime,
                    message: 'Connection successful'
                });
            });
            
            socket.on('error', (error) => {
                const responseTime = Date.now() - startTime;
                resolve({
                    success: false,
                    responseTime,
                    message: error.message,
                    error: error.code
                });
            });
            
            socket.on('timeout', () => {
                socket.destroy();
                resolve({
                    success: false,
                    responseTime: timeout,
                    message: 'Connection timeout',
                    error: 'ETIMEDOUT'
                });
            });
        });
    }
}

// Singleton instance
const connectionManager = new ConnectionManager();

module.exports = connectionManager;

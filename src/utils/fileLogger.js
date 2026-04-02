const fs = require('fs');
const path = require('path');
const os = require('os');

class FileLogger {
    constructor(baseDir = 'data') {
        this.baseDir = path.resolve(baseDir);
        this.ensureDir(this.baseDir);
    }

    /**
     * Ensure directory exists
     */
    ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    /**
     * Get log file path for equipment
     * Format: data/{YYYY-MM}/{DD}/{equip_name}_{HH}_{DDMMYY}.log
     */
    getLogFilePath(equipmentName, equipmentId) {
        const now = new Date();
        const yearMonth = now.toISOString().slice(0, 7).replace(/-/g, '-'); // YYYY-MM
        const day = now.toISOString().slice(8, 10); // DD
        const hour = now.getHours().toString().padStart(2, '0'); // HH
        const dateStamp = `${day}${now.getDate().toString().padStart(2, '0')}${String(now.getMonth()+1).padStart(2, '0')}${String(now.getFullYear()).slice(-2)}`; // DDMMYY
        
        // Sanitize equipment name
        const safeName = equipmentName
            .toLowerCase()
            .replace(/[^a-z0-9\s_-]/gi, '_')
            .replace(/\s+/g, '_')
            .substring(0, 50);
        
        const fileName = `${safeName}_${hour}_${dateStamp}.log`;
        
        const dirPath = path.join(this.baseDir, yearMonth, day);
        this.ensureDir(dirPath);
        
        return path.join(dirPath, fileName);
    }

    /**
     * Log data as JSON line
     */
    async log(equipmentName, equipmentId, data) {
        try {
            const logPath = this.getLogFilePath(equipmentName, equipmentId);
            const logEntry = {
                timestamp: new Date().toISOString(),
                equipmentId,
                equipmentName,
                ip: data._ip || 'unknown',
                status: data.status || 'unknown',
                data: data,
                triggered: data._triggered || []
            };
            
            const logLine = `${JSON.stringify(logEntry)}${os.EOL}`;
            fs.appendFileSync(logPath, logLine, 'utf8');
            
            console.log('[FILELOG] Logged to ' + path.relative(process.cwd(), logPath));
            return true;
        } catch (error) {
            console.error('[FILELOG] Error:', error.message);
            return false;
        }
    }

    /**
     * Get latest log file for equipment
     */
    getLatestLogFile(equipmentName, equipmentId) {
        const logPath = this.getLogFilePath(equipmentName, equipmentId);
        return fs.existsSync(logPath) ? logPath : null;
    }

    /**
     * List log files for equipment (last 24h)
     */
    listRecentLogs(equipmentName) {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24*60*60*1000);
        
        const yearMonth = now.toISOString().slice(0, 7).replace(/-/g, '-');
        const yesterdayDay = yesterday.toISOString().slice(8, 10);
        
        const dirs = [
            path.join(this.baseDir, yearMonth, yesterdayDay),
            path.join(this.baseDir, yearMonth, now.toISOString().slice(8, 10))
        ];
        
        const files = [];
        for (const dir of dirs) {
            if (fs.existsSync(dir)) {
                const dirFiles = fs.readdirSync(dir)
                    .filter(f => f.includes(equipmentName.toLowerCase().replace(/[^a-z0-9]/g, '_')))
                    .map(f => path.join(dir, f))
                    .sort((a, b) => fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime());
                files.push(...dirFiles);
            }
        }
        
        return files.slice(0, 10); // Last 10 files
    }
}

module.exports = new FileLogger();

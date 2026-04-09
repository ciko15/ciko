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
            if (globalThis.Bun) {
                await globalThis.Bun.write(logPath, logLine, { append: true });
            } else {
                await fs.promises.appendFile(logPath, logLine, 'utf8');
            }
            
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

    /**
     * Get all log entries across all files with pagination
     * Sorts by timestamp descending
     */
    async getHistoryLogs(options = {}) {
        const { page = 1, limit = 50, search = '', startDate = null, endDate = null } = options;
        const allEntries = [];
        
        try {
            // 1. Get all YYYY-MM folders, sorted descending
            if (!fs.existsSync(this.baseDir)) return { data: [], total: 0 };
            
            const monthFolders = (await fs.promises.readdir(this.baseDir))
                .filter(f => /^\d{4}-\d{2}$/.test(f))
                .sort((a, b) => b.localeCompare(a));
            
            for (const month of monthFolders) {
                const monthPath = path.join(this.baseDir, month);
                const dayFolders = (await fs.promises.readdir(monthPath))
                    .filter(f => /^\d{2}$/.test(f))
                    .sort((a, b) => b.localeCompare(a));
                
                for (const day of dayFolders) {
                    const dayPath = path.join(monthPath, day);
                    const files = (await fs.promises.readdir(dayPath))
                        .filter(f => f.endsWith('.log'))
                        .sort((a, b) => {
                            // Extract hour for sorting if possible
                            const hA = a.split('_')[1] || '00';
                            const hB = b.split('_')[1] || '00';
                            return hB.localeCompare(hA);
                        });
                    
                    for (const file of files) {
                        const filePath = path.join(dayPath, file);
                        const content = await fs.promises.readFile(filePath, 'utf8');
                        const lines = content.split(os.EOL).filter(l => l.trim());
                        
                        // Process lines in reverse to get newest first
                        for (let i = lines.length - 1; i >= 0; i--) {
                            try {
                                const entry = JSON.parse(lines[i]);
                                
                                // Apply filters
                                if (search && !entry.equipmentName?.toLowerCase().includes(search.toLowerCase()) && 
                                    !entry.status?.toLowerCase().includes(search.toLowerCase())) {
                                    continue;
                                }
                                
                                if (startDate && new Date(entry.timestamp) < new Date(startDate)) continue;
                                if (endDate && new Date(entry.timestamp) > new Date(endDate)) continue;
                                
                                allEntries.push(entry);
                                
                                // If we have enough entries for the current page and more, we can potentially stop
                                if (allEntries.length >= page * limit + 200) break;
                            } catch (e) { /* ignore malformed lines */ }
                        }
                        if (allEntries.length >= page * limit + 200) break;
                    }
                    if (allEntries.length >= page * limit + 200) break;
                }
                if (allEntries.length >= page * limit + 200) break;
            }
            
            // 2. Final sort
            allEntries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            // 3. Paginate
            const total = allEntries.length;
            const start = (page - 1) * limit;
            const data = allEntries.slice(start, start + limit);
            
            return { data, total };
        } catch (error) {
            console.error('[FILELOG] getHistoryLogs error:', error.message);
            return { data: [], total: 0 };
        }
    }

    /**
     * Cleanup folders older than 3 months
     */
    async cleanupOldLogs() {
        console.log('[FILELOG] Starting automated cleanup...');
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth(); // 0-11
        
        // Calculate the threshold (3 months ago)
        const thresholdDate = new Date(year, month - 3, 1);
        const thresholdStr = thresholdDate.toISOString().slice(0, 7); // YYYY-MM
        
        try {
            if (!fs.existsSync(this.baseDir)) return;
            
            const monthFolders = fs.readdirSync(this.baseDir)
                .filter(f => /^\d{4}-\d{2}$/.test(f));
            
            let deletedCount = 0;
            for (const folder of monthFolders) {
                if (folder < thresholdStr) {
                    const fullPath = path.join(this.baseDir, folder);
                    console.log(`[FILELOG] Deleting old log directory: ${folder}`);
                    fs.rmSync(fullPath, { recursive: true, force: true });
                    deletedCount++;
                }
            }
            
            console.log(`[FILELOG] Cleanup complete. Deleted ${deletedCount} folders.`);
            return deletedCount;
        } catch (error) {
            console.error('[FILELOG] cleanupOldLogs error:', error.message);
            return 0;
        }
    }
}

module.exports = new FileLogger();

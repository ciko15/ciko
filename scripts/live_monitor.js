const http = require('http');

function clearScreen() {
    process.stdout.write('\x1B[2J\x1B[0f');
}

async function fetchStats() {
    return new Promise((resolve) => {
        http.get('http://localhost:3000/api/scheduler/stats', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } 
                catch(e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

async function fetchLogs() {
    try {
        // Membaca langsung data log terbaru dari database menggunakan config bawaan
        const mysql = require('mysql2/promise');
        const config = require('./db/config.js');
        const conn = await mysql.createConnection(config);
        const [rows] = await conn.execute(`
            SELECT e.name as Nama_Alat, l.source as Sumber, JSON_UNQUOTE(JSON_EXTRACT(l.data, '$.status')) as Status, l.logged_at as Waktu 
            FROM equipment_logs l 
            LEFT JOIN equipment e ON l.equipment_id = e.id 
            ORDER BY l.logged_at DESC LIMIT 8
        `);
        await conn.end();
        return rows;
    } catch(e) {
        return null; // Abaikan jika bukan MySQL atau koneksi gagal
    }
}

async function run() {
    clearScreen();
    console.log("==========================================================");
    console.log(" 📡 LIVE MONITOR: Generator Status & Data Peralatan");
    console.log("==========================================================");
    console.log("Tekan [Ctrl+C] untuk keluar dari monitor.\n");

    const stats = await fetchStats();
    console.log(`[${new Date().toLocaleTimeString()}] ⚙️  STATUS GENERATOR / SCHEDULER:`);
    if (stats) {
        console.log(`   - Status Berjalan : ${stats.isRunning ? 'Aktif 🟢' : 'Berhenti 🔴'}`);
        console.log(`   - Total Data Masuk: ${stats.successfulCollections || 0}`);
        console.log(`   - Update Terakhir : ${stats.lastCollection || 'Belum ada'}`);
    } else {
        console.log(`   - 🔴 Menunggu server merespon... (Pastikan TOC Server sudah di-start)`);
    }

    const logs = await fetchLogs();
    console.log(`\n[${new Date().toLocaleTimeString()}] 💾 DATA ALAT TERAKHIR (Database):`);
    if (logs && logs.length > 0) {
        console.table(logs);
    } else {
        console.log(`   - ⚠️ Data log tidak dapat diambil langsung dari koneksi database.`);
        console.log(`     (Anda bisa melihat detail history di menu 'Equipment Logs' di aplikasi web)`);
    }
    
    console.log(`\n(Auto-refresh setiap 5 detik...)`);
}

setInterval(run, 5000);
run();

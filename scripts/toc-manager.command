#!/bin/bash

# Pindah ke direktori dimana file ini berada
cd "$(dirname "$0")"

# ==========================================
# FUNGSI GUI (Native macOS Dialogs)
# ==========================================

show_menu() {
    osascript <<EOT
        tell application "System Events"
            activate
            set theChoice to choose from list {"🚀 Start TOC Server", "🔄 Restart TOC Server", "🛑 Stop TOC Server", "📡 Monitor Generator & Data Live", "🛠️ Kelola Alat & Data Generator", "⚙️ Ubah Port Server", "🗄️ Start XAMPP MySQL"} with title "TOC System Manager" with prompt "Pilih aksi untuk Server TOC Anda:" OK button name "Pilih" cancel button name "Keluar"
            if theChoice is false then return "Keluar"
            return item 1 of theChoice
        end tell
EOT
}

show_alert() {
    osascript -e "display dialog \"$1\" buttons {\"OK\"} default button \"OK\" with title \"TOC System Manager\""
}

prompt_input() {
    osascript <<EOT
        tell application "System Events"
            activate
            set response to display dialog "$1" default answer "$2" buttons {"Batal", "Simpan"} default button "Simpan" with title "TOC System Manager"
            if button returned of response is "Simpan" then
                return text returned of response
            else
                return ""
            end if
        end tell
EOT
}

show_manage_menu() {
    osascript <<EOT
        tell application "System Events"
            activate
            set theChoice to choose from list {"➕ Tambah Alat Baru (GUI)", "🌐 Edit Parameter Data (Buka Web)", "💻 Edit Logic Simulasi (Buka Kode)"} with title "Manajemen Data & Simulator" with prompt "Pilih cara kelola data/alat:" OK button name "Pilih" cancel button name "Kembali"
            if theChoice is false then return "Kembali"
            return item 1 of theChoice
        end tell
EOT
}

# ==========================================
# LOGIC APLIKASI
# ==========================================

start_server() {
    # Gunakan absolute path agar pgrep/pkill tidak bentrok dengan copy-an aplikasi dari folder lain
    local SERVER_CMD="node $(pwd)/server.js"
    if pgrep -f "$SERVER_CMD" > /dev/null; then
        show_alert "⚠️ Server TOC sudah berjalan!"
    else
        # Buka Terminal baru dengan environment lengkap untuk menjalankan server (Fix masalah gagal Start)
        local DIR="$(pwd)"
        
        # Membuat script runner terpisah agar terhindar dari konflik karakter AppleScript
        cat << 'EOF' > start_server.sh
#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
clear
echo "📍 Direktori: $PWD"
echo "🟢 Versi Node.js: $(node -v 2>&1 || echo 'ERROR: NODE TIDAK DITEMUKAN')"
echo "🚀 Memulai Server..."
echo "----------------------------------------"
# Jalankan file spesifik dari folder ini
node "$PWD/server.js"
echo "----------------------------------------"
echo "❌ SERVER CRASH / GAGAL START. Silakan baca pesan error di atas!"
EOF
        chmod +x start_server.sh

        osascript -e "tell application \"Terminal\" to do script \"cd \\\"$DIR\\\"; ./start_server.sh\""
        
        show_alert "✅ Server TOC sedang dimulai di jendela Terminal baru."
    fi
}

stop_server() {
    local SERVER_CMD="node $(pwd)/server.js"
    if pgrep -f "$SERVER_CMD" > /dev/null; then
        pkill -f "$SERVER_CMD"
        show_alert "🛑 Server TOC berhasil dihentikan."
    else
        show_alert "ℹ️ Server TOC memang sedang tidak berjalan."
    fi
}

# --- Main Loop ---
while true; do
    CHOICE=$(show_menu)
    
    case "$CHOICE" in
        "🚀 Start TOC Server")
            start_server
            ;;
        "🔄 Restart TOC Server")
            local SERVER_CMD="node $(pwd)/server.js"
            if pgrep -f "$SERVER_CMD" > /dev/null; then
                pkill -f "$SERVER_CMD"
                sleep 2
            fi
            start_server
            ;;
        "🛑 Stop TOC Server")
            stop_server
            ;;
        "📡 Monitor Generator & Data Live")
            DIR="$(pwd)"
            cat << 'EOF' > live_monitor.js
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
EOF
            osascript -e "tell application \"Terminal\" to do script \"cd \\\"$DIR\\\"; node live_monitor.js\""
            show_alert "✅ Terminal Live Monitor berhasil dibuka."
            ;;
        "🛠️ Kelola Alat & Data Generator")
            MANAGE_CHOICE=$(show_manage_menu)
            case "$MANAGE_CHOICE" in
                "➕ Tambah Alat Baru (GUI)")
                    eq_name=$(prompt_input "Masukkan Nama Alat Baru:" "Sensor Cuaca 01")
                    if [ -z "$eq_name" ]; then continue; fi
                    
                    eq_code=$(prompt_input "Masukkan Kode Alat (Pastikan Unik):" "WTH-001")
                    if [ -z "$eq_code" ]; then continue; fi
                    
                    eq_cat=$(osascript -e 'tell application "System Events" to choose from list {"Communication", "Navigation", "Surveillance", "Data Processing", "Support"} with title "Pilih Kategori" with prompt "Pilih Kategori Alat:" OK button name "Pilih"')
                    if [ "$eq_cat" == "false" ]; then continue; fi

                    DIR="$(pwd)"
                    cat << 'EOF' > auto_insert_db.js
const mysql = require('mysql2/promise');
const config = require('./db/config.js');
const [,, name, code, category] = process.argv;

async function run() {
    try {
        const conn = await mysql.createConnection(config);
        const [airports] = await conn.execute("SELECT id, name FROM airports LIMIT 1");
        if(airports.length === 0) {
            console.log("ERROR: Data bandara belum ada. Buka web dan tambah minimal 1 bandara.");
            process.exit(1);
        }
        const [res] = await conn.execute(
            "INSERT INTO equipment (name, code, category, airport_id, status) VALUES (?, ?, ?, ?, 'Normal')", 
            [name, code, category, airports[0].id]
        );
        try { await conn.execute("UPDATE equipment SET snmp_config = '{\"enabled\":true, \"templateId\":1}' WHERE id = ?", [res.insertId]); } catch(e){}
        await conn.end();
        console.log("SUCCESS");
    } catch(e) { console.log("ERROR: " + e.message); }
}
run();
EOF
                    RESULT=$(node "$DIR/auto_insert_db.js" "$eq_name" "$eq_code" "$eq_cat")
                    if [[ "$RESULT" == *"SUCCESS"* ]]; then
                        show_alert "✅ SUKSES!\n\nAlat '$eq_name' ($eq_code) berhasil ditambahkan ke database.\n\nSistem Generator Live akan mendeteksi dan membuat data simulasi secara otomatis."
                    else
                        show_alert "❌ GAGAL MENYIMPAN!\n\nPastikan Server Database berjalan dan Kode Alat belum pernah dipakai.\n\nDetail: $RESULT"
                    fi
                    ;;
                "🌐 Edit Parameter Data (Buka Web)")
                    open "http://localhost:3000"
                    show_alert "ℹ️ PANDUAN MENGUBAH DATA GENERATOR:\n\n1. Login sebagai Admin\n2. Buka menu 'SNMP Templates'\n3. Jika Anda menambah 'OID Mappings' baru (misal: 'Kecepatan Angin'), Generator di server.js secara otomatis akan mendeteksi field tersebut dan men-generate angka acaknya!\n\n*(Web App sedang dibuka di browser Anda)*"
                    ;;
                "💻 Edit Logic Simulasi (Buka Kode)")
                    if command -v code > /dev/null; then code "$PWD/server.js" "$PWD/scheduler-demo.js"; else open -a TextEdit "$PWD/server.js" "$PWD/scheduler-demo.js"; fi
                    show_alert "✅ File Konfigurasi Logic telah dibuka.\n\nCari kata kunci 'SIMULATION_MODE' atau fungsi random() di file tersebut untuk mengubah behavior rentang angka yang di-generate oleh sistem."
                    ;;
            esac
            ;;
        "⚙️ Ubah Port Server")
            current_port=$(grep -o "const PORT = [0-9]*;" server.js | grep -o "[0-9]*")
            new_port=$(prompt_input "Masukkan port baru:" "$current_port")
            if [[ -n "$new_port" ]] && [[ "$new_port" =~ ^[0-9]+$ ]]; then
                sed -i '' "s/const PORT = [0-9]*;/const PORT = $new_port;/" server.js
                show_alert "✅ Sukses! Port diubah menjadi $new_port.\n\nSilakan pilih menu Restart TOC Server agar perubahan ini berlaku."
            fi
            ;;
        "🗄️ Start XAMPP MySQL")
            # Menjalankan service MySQL XAMPP dengan GUI prompt untuk password admin
            osascript -e 'do shell script "/Applications/XAMPP/xamppfiles/xampp startmysql" with administrator privileges'
            show_alert "✅ Perintah Start MySQL (XAMPP) telah dieksekusi."
            ;;
        "Keluar"|*)
            exit 0
            ;;
    esac
done
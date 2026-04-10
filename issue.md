# Implementasi & Verifikasi Skema Parsing Data Equipment (UDP/TCP)

## 📌 Latar Belakang
Aplikasi ini bertugas untuk memonitor data dari berbagai peralatan navigasi/komunikasi (equipment). Setiap equipment akan mengirimkan data mentah (raw data) melalui koneksi UDP atau TCP ke alamat IP dan Port tertentu di server aplikasi. 

Aplikasi memiliki modul parsir di dalam folder `/src/parsers/` (contoh: `dme_maru_310_320.js`) yang bertugas menerjemahkan raw data ini menjadi struktur data JSON yang bisa dibaca dan disimpan.

## 🎯 Tujuan Issue
Memastikan **alur (pipeline) data dari penerimaan UDP/TCP hingga ke proses parsing berjalan dengan baik dan modular**. 

Skema yang diharapkan:
1. **Otentikasi & Koneksi**: Aplikasi membuka koneksi mendengarkan (listen) pada IP dan UDP Port yang sesuai dengan konfigurasi alat.
2. **Routing Parsers**: Aplikasi mengetahui file parser mana yang harus digunakan berdasarkan tipe koneksi alat (misal: `connection_type = 'dme_maru_310_320'`) tanpa perlu melakukan *hard-code* secara berlebihan.
3. **Penyatuan Data Flow**: Saat data masuk melalui Port tersebut, data langsung dilempar ke file parser yang tepat (seperti `dme_maru_310_320.js`), diproses, dan hasilnya siap disimpan ke database.
4. **Modularitas (Future-proofing)**: Jika di masa depan ada alat baru, kita hanya perlu menambahkan file parser baru di `/src/parsers/` dan mendaftarkannya di `factory.js` tanpa harus mengubah logika inti penerimaan data jaringan.

---

## 🔍 Kondisi Saat Ini (Hasil Analisis)
Berdasarkan pengecekan kode:
- **Tersedia:** `src/parsers/factory.js` sudah siap untuk menginisiasi parser berdasarkan `connection_type`.
- **Tersedia:** `src/parsers/dme_maru_310_320.js` dan parser lainnya sudah berdiri sendiri meng-*extend* `BaseParser` dan memiliki fungsi `parse(rawData)`.
- **Tersedia:** `src/connection/manager.js` memiliki fungsi `connectUDP` dan `connectTCP` untuk mendengarkan port jaringan.
- 🔴 **Masalah (Missing Link):** Fungsi `connectUDP` pada `ConnectionManager` **TIDAK PERNAH DIPANGGIL** di kode manapun di flow utama. Artinya, saat ini logika penghubung antara data jaringan yang masuk dengan eksekusi `ParserFactory` masih terputus (belum diimplementasikan dalam service yang berjalan aktif).

---

## 🛠️ Langkah-Langkah Implementasi (Untuk Programmer/AI)

Untuk memperbaiki dan merealisasikan skema ini, ikuti langkah sistematis berikut:

### 1. Buat Service Penghubung Jaringan & Parsers (Misal di `src/scheduler/collector.js` atau buat `src/services/network_listener.js`)
Anda perlu membuat fungsi inisialisasi yang melakukan fetch ke database untuk semua alat yang aktif saat server menyala:
- Ambil data alat meliputi: `id`, `ipAddress` (atau host), `port`, dan `connection_type` (tipe alat/parser).
- Lakukan iterasi pada setiap alat untuk menginisialisasi listener.

### 2. Inisiasi Parser dari Factory
Untuk setiap alat di dalam iterasi, panggil:
```javascript
const ParserFactory = require('../parsers/factory');

// Pastikan connection_type sesuai dengan yang didukung oleh factory
const parser = ParserFactory.createParser(equipment.connection_type, equipment.parser_config || {});

if (!parser) {
    console.warn(`Parser tidak ditemukan untuk alat: ${equipment.name}`);
    // Lanjut ke iterasi alat berikutnya
}
```

### 3. Binding Socket Jaringan UDP/TCP
Gunakan `ConnectionManager` untuk menjembatani alat tersebut dengan server:
```javascript
const connectionManager = require('../connection/manager');

// Jika alat menggunakan UDP
connectionManager.connectUDP(
    equipment.id, 
    equipment.ipAddress, // atau equipment.host
    equipment.port, 
    (rawData) => {
        // [LANJUT KE LANGKAH 4] Callback ini dieksekusi saat ada data masuk dari alat
    },
    (err) => {
        console.error(`Error pada alat ${equipment.name}:`, err);
    }
);
```

### 4. Proses Eksekusi Parsing (Data Flow)
Di dalam fungsi *callback* `(rawData)` di atas, panggil parser yang sudah disiapkan:
```javascript
const result = parser.parse(rawData);

if (result.success) {
    // 1. Simpan result.data ke log database
    // misal: db.createEquipmentLog({ equipmentId: equipment.id, data: result.data, status: result.status ... })
    
    // 2. Update status equipment terkini berdasarkan result.status (Normal/Warning/Alarm)
} else {
    console.error(`Gagal melakukan parse untuk ${equipment.name}:`, result.error);
}
```

### 5. Registrasi Service di `server.ts`
Pastikan fungsi/class service yang Anda buat tersebut dipanggil di dalam file utama `src/server.ts` pada saat inisialisasi aplikasi (contoh: dipanggil di dalam fungsi `startServices()`).

### 6. Verifikasi Modularitas
Pastikan alur di atas bekerja murni berdasarkan variabel `connection_type`.
Jika kita menambahkan alat baru:
1. Buat file baru `/src/parsers/alat_baru.js`.
2. Tambahkan `case 'alat_baru'` di `/src/parsers/factory.js`. 
3. Simpan data spesifikasi alat di database dengan `connection_type = 'alat_baru'`.

Sistem jaringan tidak perlu diubah, dan aplikasi akan otomatis mendengarkan port yang baru dan menggunakan file parser yang baru.

---

## ✅ Kriteria Sukses (DoD - Definition of Done)
1. Aplikasi berhasil binding (listen) ke port UDP/TCP sesuai konfigurasi database tanpa adanya error konflik port.
2. Ketika simulator mengirimkan raw data ke port tersebut, data ditangkap oleh `connectionManager.js`.
3. File parser spesifik (misal `dme_maru_310_320.js`) otomatis tereksekusi dan memberikan return objek JSON.
4. Nilai parse JSON berhasil disimpan ke database.
5. Mendukung penambahan parser/alat baru tanpa perlu melakukan hard-code di sisi *connection listener*.

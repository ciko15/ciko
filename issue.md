# [FEATURE] Perbaikan Alur Koneksi Alat, Implementasi Threshold Alarm, dan Filter Kategori Map

## 📌 Latar Belakang Masalah
1. **Alur Validasi Data (Dummy/Real) & Koneksi:** Saat ini, sistem (termasuk *generator test*) kadang masih menampilkan atau mencoba memproses data meskipun gateway atau alat dalam kondisi *offline*. Alur autentikasi koneksi harus diperketat agar data tidak di-*generate*/di-*parsing* jika perangkat tidak *reachable*.
2. **Implementasi Limitasi/Threshold Alarm:** Sistem membutuhkan mekanisme penentuan nilai parameter (batas atas/bawah) untuk mengetahui secara spesifik parameter mana yang menyebabkan alat berstatus **Warning** atau **Alarm**.
3. **Filter Map Dashboard:** Filter berdasarkan *Status* (Normal, Warning, Disconnect) di Map Dashboard sudah berfungsi, namun filter berdasarkan *Kategori Alat* (Communication, Navigation, Surveillance, Data Processing, Support) masih gagal memfilter marker bandara yang ada di Map.

---

## 📋 Tugas & Tahapan Implementasi
Instruksi di bawah ini ditujukan untuk programmer yang mengimplementasikan fitur ini. Kerjakan secara berurutan.

### Task 1: Perbaikan Alur Autentikasi Koneksi & Parsing Data (Backend)
**File Target:** `src/server.ts`, `src/scheduler/collector.js` (atau file scheduler terkait pengumpulan data), `src/utils/network.ts`

**Tujuan:** Pastikan tidak ada parsing data (baik SNMP asli maupun generator simulasi) jika perangkat gagal di-ping secara berjenjang.

**Langkah-langkah:**
1. **Gunakan Logika Ping Bertingkat (Tiered Ping) di Scheduler:** 
   Pada fungsi scheduler (seperti `collectEquipmentData`), sebelum memanggil `fetchAndParseData(item)`:
   - Ambil konfigurasi `ip_branch` (Gateway) dan IP Alat.
   - Cek flag `bypassGateway` pada `snmpConfig`.
   - **Langkah A:** Jika `bypassGateway` false, ping `ip_branch`. Jika RTO (Offline), langsung set status equipment menjadi `Disconnect` dengan log "Gateway Unreachable". Jangan lanjutkan ke parsing.
   - **Langkah B:** Jika Gateway sukses (atau `bypassGateway` true), ping IP Alat. Jika RTO, set status menjadi `Disconnect` dengan log "Device Unreachable". Jangan lanjutkan ke parsing.
2. **Eksekusi Parsing:**
   - Jika Langkah A dan B sukses, panggil fungsi `fetchAndParseData` berdasarkan template alat yang dipilih.
   - Khusus untuk **Simulator/Generator**: Generator *hanya* boleh menghasilkan angka acak jika alat tersebut lulus validasi ping jaringan ini.

### Task 2: Implementasi Logika Threshold (Limitasi Alarm/Warning)
**File Target:** `src/utils/thresholdEvaluator.js`, `src/server.ts`, `public/app.js`

**Tujuan:** Menganalisis nilai dari hasil parsing terhadap batas (threshold) yang ditentukan di template, dan menandai parameter mana yang bermasalah.

**Saran & Langkah Implementasi:**
1. **Penyempurnaan Struktur Mapping:** Saat ini di dalam `oidMappings` database sudah ada kerangka untuk `warningThreshold` dan `criticalThreshold`. 
2. **Buat Fungsi Evaluator (`src/utils/thresholdEvaluator.js`):**
   - Buat fungsi yang menerima dua parameter: `parsedData` (data mentah) dan `templateMappings` (konfigurasi OID dari DB).
   - Loop melalui setiap *key* di `parsedData`. Bandingkan nilainya dengan `warningThreshold` dan `criticalThreshold` dari mapping-nya.
   - Fungsi ini harus mengembalikan object:
     ```json
     {
       "overallStatus": "Alert", // (Normal | Warning | Alert)
       "triggeredParameters": ["temperature", "voltage"] // array parameter yang melanggar batas
     }
     ```
3. **Simpan Fault Parameter ke Database:**
   - Modifikasi payload saat membuat log (`db.createEquipmentLog`). Masukkan properti `triggeredParameters` ke dalam object `data` agar histori alarm tersimpan dengan jelas.
4. **Visualisasi di Frontend (`public/app.js`):**
   - Pada fungsi `window.viewSnmpData`, tangkap array `triggeredParameters` dari response backend.
   - Tambahkan *conditional styling*: Jika nama parameter berada di dalam list `triggeredParameters`, ubah warna teks box nilainya menjadi Merah (Alert) atau Kuning (Warning) lengkap dengan ikon peringatan (`<i class="fas fa-exclamation-circle"></i>`).

### Task 3: Perbaikan Filter Kategori pada Map Dashboard
**File Target:** `public/app.js`

**Tujuan:** Mengklik card "Kategori Alat" (Communication, Navigation, dsb.) di dashboard harus memfilter marker yang muncul di Peta (hanya menampilkan bandara yang memiliki alat di kategori tersebut).

**Langkah-langkah:**
1. **Siapkan State Filter:** 
   Di bagian atas `app.js`, tambahkan global state:
   `let currentMapCategoryFilter = null;`
2. **Modifikasi Logic `updateMapMarkers()`:**
   - Buka fungsi `updateMapMarkers()`. Sebelum melakukan `airportsData.forEach(...)` untuk merender marker, filter datanya terlebih dahulu:
     ```javascript
     let airportsToRender = airportsData;
     if (currentMapCategoryFilter && currentMapCategoryFilter !== 'Total') {
         airportsToRender = airportsData.filter(airport => {
             const count = airport.activeEquipmentCount[currentMapCategoryFilter] || 0;
             return count > 0; // Hanya render bandara yang punya alat kategori ini
         });
     }
     // Lanjutkan mapping layer leaflet dari airportsToRender
     ```
3. **Hubungkan Event Click Kategori ke Map:**
   - Buka fungsi `initDashboardFilters()`.
   - Pada bagian `2. Category Items`, saat ini behavior-nya adalah menavigasi paksa ke menu Cabang menggunakan `switchMainSection('cabang')`.
   - Ubah logika *click listener* ini (atau tambahkan behavior opsional) agar ketika di-klik:
     - Mengubah state `currentMapCategoryFilter = category;`
     - Memanggil ulang fungsi `updateMapMarkers();` untuk memperbarui peta seketika.
     - *(Opsional UX)*: Tambahkan styling `border` atau `opacity` untuk menandakan kategori mana yang saat ini sedang aktif di-klik.

---

## 🎯 Kriteria Penerimaan (Acceptance Criteria)
- [ ] Scheduler mengabaikan pembuatan log/simulasi data jika IP Gateway atau Alat dinyatakan RTO.
- [ ] Hasil SNMP atau generator membawa flag/status parameter individu yang melanggar threshold.
- [ ] Modal *View SNMP Data* di Frontend berhasil me-highlight parameter bermasalah dengan warna merah/kuning.
- [ ] Marker pada Dashboard Map akan menghilang jika memfilter kategori yang tidak terdapat pada bandara tersebut.

**Catatan untuk AI / Programmer:** 
Cukup ubah bagian-bagian yang disebutkan di atas. Fokus pada kejelasan struktur, hindari merusak alur ping eksisting (`securePing` / `pingTiered`) yang sudah ada di sistem. Gunakan fallback API apabila terdapat kegagalan pada network testing.
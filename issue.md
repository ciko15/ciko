# Tugas Migrasi Node.js ke Bun & Dokumentasi SOP

Tugas ini merupakan panduan langkah demi langkah untuk melakukan migrasi penuh sistem backend dari Node.js (Legacy) ke Bun (Modern) serta mendokumentasikan SOP dan cara kerja sistem di README.md.

## Daftar Tugas

- [ ] **Fase 1: Analisis & Persiapan**
  - [ ] Pahami alur kerja backend saat ini dengan membaca `server.js` (versi Express JS awal).
  - [ ] Bandingkan alur kerja tersebut dengan `src/server.ts` (versi Bun/Elysia JS modern).
  - [ ] Identifikasi fitur-fitur yang masih berjalan di `server.js` namun belum dipindahkan ke `src/server.ts`.

- [ ] **Fase 2: Migrasi Endpoint & Fix Bug (Server Bun)**
  - [ ] Perbaiki logika di `src/server.ts` pada endpoint `/api/airports` agar jumlah peralatan (`equipmentCount`, `activeEquipmentCount`) tampil akurat apabila terjadi ketidakcocokan data.
  - [ ] Periksa dan implementasikan fungsionalitas **Ping/Monitoring Berjenjang (Tier 1 Gateway & Tier 2 Equipment)** dari `server.js` ke dalam modul `src/server.ts` atau `src/utils/network.ts`.
  - [ ] Tambahkan seluruh fitur parser dan receiver (Radar & ADS-B) ke sistem Bun dengan memastikan modul-modul parser berjalan murni di backend Bun.
  
- [ ] **Fase 3: Implementasi Data Generator di Bun**
  - [ ] Periksa file `src/utils/simulators.ts` untuk memastikan fungsi `generateDvorMaruData`, `generateDmeMaruData`, dan `generateSimulatedData` sudah identik dengan yang ada di `server.js`.
  - [ ] Periksa `src/utils/network.ts` dan pastikan fungsi `fetchAndParseData` dapat dijalankan dengan benar oleh _Background Scheduler_ di `src/server.ts`.
  - [ ] Uji fungsionalitas simulasi data agar dapat dipantau dari Dashboard secara real-time.
  
- [ ] **Fase 4: Dokumentasi SOP & README.md**
  - [ ] Buka file `README.md`.
  - [ ] Tambahkan/perbarui bagian **SOP Penggunaan Aplikasi**: Cara menyalakan server menggunakan Bun, memantau log, dan memeriksa kesehatan server.
  - [ ] Tambahkan panduan mengenai **Cara Kerja Generator Data**: Jelaskan bagaimana _SIMULATION MODE_ aktif otomatis pada peralatan bila tidak ada koneksi real.
  - [ ] Secara eksplisit tuliskan di README.md bahwa `server.js` adalah "Legacy Mode" dan developer baru harus fokus pada direktori `src/` menggunakan Bun.

- [ ] **Fase 5: Pengujian (Verification)**
  - [ ] Matikan secara penuh server NodeJS lama (Hentikan proses `node server.js`).
  - [ ] Jalankan server menggunakan Bun: `bun src/server.ts` atau `bun run dev:bun`.
  - [ ] Buka antarmuka aplikasi.
  - [ ] Pastikan seluruh endpoint utama `/api/equipment`, `/api/airports`, `/api/snmp/*` merespons dengan cepat.
  - [ ] Verifikasi halaman Detail Peralatan menampilkan grafik data yang terus bergerak aktif akibat generator data.

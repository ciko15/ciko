# Issue Tracker: Network Tools API & UI Fixes

Dokumen ini ditujukan untuk programmer pemula atau AI assistant agar dapat dengan mudah memperbaiki masalah yang dilaporkan pengguna pada menu Network Tools dan Network Monitoring. Terdapat 3 bagian utama yang perlu diperbaiki: UI State, Data Parsing (IP/Port), dan Layout/DOM Restructuring.

---

## 1. Masalah pada UI "Empty State" (Poin 1, 2, 3)

**Gejala yang terjadi:** 
Ketika pengguna sudah memilih packet dari tabel `packet list`, teks empty state berikut tetap muncul (tidak tertimpa oleh data):
- "Select a packet to view details" (pada Packet Detail)
- "Select a packet to perform content analysis" (pada Packet Content Analysis)
- "Select a packet to view hex data" (pada Hex Viewer)

**Lokasi File yang Terlibat:**
- `public/network-tools.js` (Fungsi `displayPacketDetails`, `displayHexViewer`, `analyzePacketContent`)
- `public/index.html` (Div id: `packetDetailsContent`, `packetAnalysisContent`, `hexViewerContent`)

**Langkah Perbaikan:**
1. Di dalam `public/network-tools.js` fungsi `displayPacketDetails(packetNumber)`, data paket diambil dari array `window.capturedPackets`. Jika tabel sering *update* dan data awal sudah terhapus (misal karena buffer limit), pencarian `packet` akan gagal dan fungsi melakukan return dini.
2. Anda bisa memberikan notifikasi atau membersihkan tampilan jika packet tidak ditemukan.
3. Periksa juga apakah terjadi `try-catch block / error` di `displayHexViewer(packet)` atau `analyzePacketContent(packet)` yang mencegah kode melanjutkan untuk me-replace innerHTML. Sisipkan perintah `console.log("Packet data:", packet)` untuk di-debug.
4. **Perbaikan termudah:** Pastikan elemen detail selalu diganti isinya ketika tabel diklik. Cek ID pada HTML:
   - `<div id="packetDetailsContent">...</div>`
   - `<div id="packetAnalysisContent">...</div>`
   - `<div id="hexViewerContent">...</div>`
   Jika ada kegagalan manipulasi DOM, update *innerHTML* nya untuk menampilkan UI yang ramah pengguna.

---

## 2. Format IP Address dan Port yang Bergabung (Poin 4)

**Gejala yang terjadi:** 
Terdapat data IP address yang tampil sebagai `172.20.63.52.44517`. Pengguna menganggap format IP ini salah karena digit terakhir (44517) melebihi batas 254. Angka kelima tersebut sebenarnya adalah *Port Number* yang secara standar digabungkan oleh utilitas *tcpdump* menggunakan tanda titik (`.`).

**Lokasi File yang Terlibat:**
- `src/network/sniffer.js` (Backend) - Fungsi `parseTcpdumpLine(line, interfaceName)`

**Langkah Perbaikan:**
1. Buka `src/network/sniffer.js` dan cari fungsi bernama `parseTcpdumpLine()`.
2. Pada bagian baris yang mengekstrak regex dari output eksekusi command tcpdump (sekitar `const match = line.match(...)`), modifikasi `packet.source` dan `packet.destination`.
3. Buat fungsi bantuan untuk membersihkan format IP. Ekstrak *port* dari digit terakhir setelah titik yang keempat.
   **Contoh Solusi Kode:**
   ```javascript
   function formatIpPort(address) {
       // Misal: '172.20.63.52.44517'
       const parts = address.split('.');
       if (parts.length > 4) {
           const port = parts.pop(); // keluarkan 44517
           const ip = parts.join('.'); // gabungkan sisa ke 172.20.63.52
           // Gunakan format IP:Port
           return `${ip}:${port}`;
       }
       return address;
   }
   ```
4. Ubah pengaturan nilai pada `packet.source = formatIpPort(match[3])` dan `packet.destination = formatIpPort(match[4])`.

---

## 3. Restrukturisasi Layout Network Monitoring & Network Tools (Poin 5)

**Gejala yang terjadi:** 
Pengguna ingin layout Network Monitoring dirombak: Seluruh konten di bagian menu "Network Monitoring" harus dihapus sepenuhnya, lalu diganti/diisi menggunakan komponen "Connected Devices" yang saat ini diletakkan pada menu "Network Tools".

**Lokasi File yang Terlibat:**
- `public/index.html`

**Langkah Perbaikan (Pindahkan HTML Code):**
1. Buka file `public/index.html`.
2. Cari bagian HTML dengan ID `<section class="..." id="network-monitorSection">`.
3. Di dalam section tersebut (biasanya dalam class `<div class="crud-container">`), **hapus semua div element** (contoh: *Network Stats Overview*, *Interface Traffic Stats*, *Connectivity Test*, dll) sehingga section itu jadi kosong alias bersih.
4. Kemudian, cari bagian HTML degan ID `<section class="..." id="network-toolsSection">`.
5. Temukan elemen komponen Scanner ARP bernama: 
   `<div class="card" style="margin-top: 20px;" id="deviceScanSection">...</div>`
6. **CUT / Pindahkan** elemen `deviceScanSection` tersebut beserta isinya keluar dari menu `network-toolsSection`.
7. **PASTE** elemen tersebut ke dalam `network-monitorSection` (menu Network Monitoring) yang sebelumnya telah Anda bersihkan.
8. Simpan file `index.html`. Fungsi `scanConnectedDevices()` pada JS otomatis akan tetap dapat berjalan dengan normal karena memanggil id yang bersifat terpusat/global!

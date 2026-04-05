# Issue: Penambahan Menu "Configure" dan Penyesuaian Logika "Limitation"

## Deskripsi Singkat
Sistem saat ini sudah memiliki beberapa file konfigurasi database JSON (`limitation_config.json`, `equipment_otentication_config.json`, `equipment_parsing_config.json`, `sup_category.json`, `category.json` dll). Kita perlu membuat satu menu antarmuka (UI) khusus bernama **"Configure"** yang berfungsi sebagai panel kontrol pusat untuk mengelola seluruh data dari konfigurasi ini.

Selain itu, terdapat perubahan logika bisnis mendasar pada konfigurasi **Limitation**: data limitation tidak lagi dibuat secara individual per _equipment_ (alat), melainkan menjadi standar parameter yang terkait dengan satu **Sub-Kategori (`sup_category`)** alat yang sama. Standar limitasi ini hanya bisa dikelola melalui menu Configure. 

## Kriteria Penerimaan (Acceptance Criteria)

### 1. Pembuatan Menu Utama "Configure"
*   Tambahkan item menu baru di navigasi utama (side / header navigation) dengan label **"Configure"**.
*   Di dalam menu Configure, sediakan sub-menu atau _Tab_ untuk mengelola entitas berikut:
    1.  **Limitation** -> Terhubung ke `limitation_config.json`
    2.  **Authentication** -> Terhubung ke `equipment_otentication_config.json`
    3.  **Parsing** -> Terhubung ke `equipment_parsing_config.json`
    4.  **Category** -> Mengelola daftar kategori utama.
    5.  **Sup Category** -> Terhubung ke `sup_category.json`

### 2. Perubahan Fundamental pada Logika "Limitation"
*   **Perubahan Referensi Data**: Data pada limitation _tidak boleh_ menggunakan referensi per ID alat individu lagi. Data ini harus merujuk pada `sup_category` (sebagai standar parameter untuk seluruh alat pada sub-kategori tersebut).
*   **Pemisahan Proses Input**: Input nilai limitation tidak lagi dilakukan/tidak tersedia saat membuat atau mengedit data Equipment. Proses input/edit batasan limitasi HANYA BISA dilakukan di sub-menu **Configure -> Limitation**. 
*   **Tipe Parameter Beragam (Dinamis)**: Form input limitation harus mendukung jenis (tipe) data yang berbeda. Jika sebelumnya limitation banyak berisi angka (wlv, alv, ahv, whv dll), sekarang limitation harus bisa memiliki nilai berupa **string (teks)** seperti "ok", "standby", atau berupa **persentase (%)**.
*   **Modifikasi Struktur Database Limitation**: Tambahkan kolom/field baru pada tabel (atau JSON) limitation untuk menyesuaikan tipe data yang beragam tersebut.
*   **Dummy Data**: Tambahkan beberapa parameter limitation permulaan (seeding) sebagai contoh, misal: Untuk _sup category_ **VHF A/G**, buat _parameter_ dengan nama **Full Services** (contoh value: "ok").

### 3. Perbaikan Fungsionalitas Modal/Detail
*   Di pada setiap tombol detail (seperti saat membuka popup/modal detail untuk parameter atau konfigurasi apapun), pastikan tombol "X" atau tombol close berfungsi secara total untuk menyembunyikan elemen tanpa adanya interaksi tersangkut (macet).

---

## Panduan Implementasi (Bagi Programmer/AI)

### Bagian 1: Backend (Server & Database File)
1.  **Sesuaikan File Konfigurasi JSON Limitation** (`db/limitation_config.json`):
    *   Hapus referensi ke `id` alat yang sudah spesifik (jika ada).
    *   Tambahkan referensi untuk `sup_category`.
    *   Ubah contoh skema datanya agar mendukung struktur parameter seperti ini:
        ```json
        {
           "id": 1,
           "sup_category": "VHF A/G",
           "parameter_name": "Full Services",
           "value_type": "string",
           "expected_value": "ok"
        }
        ```
    *   (Gunakan penamaan _key_ JSON yang semantik sesuai kebutuhan).
2.  **API Routes** (`src/server.ts` dst.):
    *   Buat atau pastikan API endpoints CRUD (GET, POST, PUT, DELETE) siap untuk endpoint-endpoint configurasi: `/api/limitations`, `/api/otentication`, `/api/parsing`, `/api/category`, `/api/sup_category`.
    *   Pada API Detail Equipment (`GET /api/equipment/:id`), logika query limitation harus ikut diubah: jangan cari berdasarkan `equipt_id`, melainkan cari limitation berdasarkan kolom `sup_category` alat tersebut.

### Bagian 2: Frontend (User Interface)
1.  **Navigasi & Menu Baru**:
    *   Buka `public/index.html` dan letakkan penambahan menu sidebar **Configure**.
    *   Sembunyikan dan tampilkan blok-blok menggunakan atribut `.hidden` pada div terkait ketika Sub-Menu configuration diklik menggunakan JavaScript.
2.  **Formulir Limitation di UI**:
    *   Hapus input form limitation dari proses `Create/Edit Equipment`.
    *   Di panel _Configure -> Limitation_, buat _Data Table_ yang melist semua _limitation standard_. 
    *   Sediakan form untuk *Add/Edit Limitation* yang menggunakan dropdown untuk memilih `sup_category`, lalu opsi untuk menentukan jenis input valuenya ("Angka/Nominal", "Teks/Status", atau "Persentase").
3.  **Sempurnakan Fungsi Close (X)**:
    *   Inspeksi semua file JS (terutama `public/app.js`), cari id popup modal (contoh: `#detailModal`).
    *   Pastikan pada tag `<button class="close">x</button>` dan div overlay (`.modal-backdrop`) semuanya ditautkan dengan `addEventListener('click')` yang berfungsi menghilangkan kelas _visible_ / menghidden modal. Cek jika ada double event listener yang menabrak.

**Note Tambahan**: Semua komponen tampilan tabel, tombol Add, Edit, Delete pada menu Configure harus dibuat semirip mungkin dengan tabel CRUD pada equipment untuk menjaga kekonsistenan desain (UX).

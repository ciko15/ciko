# Spesifikasi Implementasi Restrukturisasi Database & UI Equipment

Dokumen ini berisi spesifikasi teknis dan terstruktur mengenai *issue* restrukturisasi penyimpanan dan tampilan data *equipment*. Instruksi ini didesain agar sangat spesifik dan bersahabat untuk didistribusikan kepada *programmer* baru maupun agen AI. Gunakan daftar tugas (*task list*) di bawah untuk melacak proses pengerjaan.

## 📝 1. Pembaruan Skema `equipment`
Ubah struktur data utama `equipment` (mis. pada file `equipment_config.json` atau tabel *database* yang relevan) dengan format berikut:

- [ ] **`id`**: *String / UUID* (Bersifat *unique*)
- [ ] **`name`**: *String* (Nama alat)
- [ ] **`category`**: *Enum / String*
  - Pilihan wajib: `Communication`, `Navigation`, `Surveillance`, `Data Processing`, `Support`
- [ ] **`sup_category`**: *String*
  - Mengambil data berelasi / referensi dinamis terhadap daftar *database* `sup_category`.
  - **Kebutuhan Form UI**: Tambahkan fitur / tombol agar pengguna dapat menciptakan data *sup_category* baru langsung dari area *form* UI pemasukan *equipment* (*on-the-fly*) bila opsinya dirasa kurang.
- [ ] **`merk`**: *String* (Set nilai *default* ke `"-"` jika tidak diinput)
- [ ] **`type`**: *String* (Set nilai *default* ke `"-"` jika tidak diinput)
- [ ] **`status`**: *Enum / String*
  - Pilihan wajib: `Active`, `Inactive`
- [ ] **`status_ops`**: *Enum / String*
  - Pilihan wajib: `Normal`, `Warning`, `Alarm`, `Disconnect`
- [ ] **`description`**: *Text / String* (Keterangan lebih lanjut tentang alat)
- [ ] **`equipt_auth`**: *Array / Relational data* (Ini memicu fitur sinkronisasi pembuatan/penambahan IP jaringan dari UI Form agar datanya otomatis disematkan atau mengalir ke entitas tabel `equipment_otentication_config`)

---

## 📝 2. Penciptaan Database / Koleksi `sup_category`
Buat skema penampungan baru (berupa Tabel / File JSON) khusus untuk sumber data (*supply*) *dropdown* *sub-category*.

- [ ] Buat file sistem untuk `sup_category`.
- [ ] Lakukan injeksi (*seed*) data basis bawaannya secara terkelompok:
  - **Communication**: VHF A/G, VSCS, HF, VHF G/G, DS, VSAT, Voice REC, D-ATIS
  - **Navigation**: DVOR, DME, ILS-TDME, ILS-LLZ, ILS-GP, ILS-IM, ILS-MM, ILS-OM, NDB, GNSS, MLS, GBAS
  - **Surveillance**: RADAR, ADSB, ADSC, MLAT
  - **Data Processing**: ATCAS, AMSC, AMHS, ASMGCS
  - **Support**: G-LLZ, G-RADAR, G-OPS, UPS, GENSET
- [ ] **Kebutuhan Integrasi Form**: Hubungkan relasi interaksinya. Jika ada penambahan pada entitas ini, maka formulir isian `equipment` pada *frontend* otomatis langsung mengakomodir pilhannya. Form *equipment* memuat logika *dependent/cascading list*: isi dari tipe dropdown *sup_category* berpatokan pada pilihan form sebelumnya di field `category`.

---

## 📝 3. Migrasi Entitas `templates_config` menjadi `equipment_parsing_config`
Tabel identifikasi *setup* parser yang sudah ada perlu diubah tata nama penampungnya.

- [ ] Ubah (*rename*) tabel/file dari `templates_config` menjadi nama baru yakni `equipment_parsing_config`.
- [ ] Sesuaikan skema struktur propertinya menjadi:
  - **`id`**: *String / UUID* (Bersifat *unique*)
  - **`name`**: *String* (Contoh: "DVOR MARU 220")
  - **`category`**: *String* (Nilainya dibatasi/menarik referensi dari list `category` *equipment*: seperti `Navigation` dst.)
  - **`files`**: *String / Path Directory* (Lokasi letaknya modul *parser code*, contoh: `"/public/parsers/asterix.js"`)
- [ ] *Search-and-Replace (Refleksi di kode keseluruhan)*: Modifikasi konfigurasi *backend route / REST API endpoints*, *frontend fetch() parameter*, serta seluruh perumusan kodenya dari merujuk ke tabel lama (`templates_config`) menjadi nama yang benar (`equipment_parsing_config`).

---

## 📝 4. Penciptaan Database / Koleksi `equipment_otentication_config`
Menjembatani akses otentikasi IP ke banyak komponen riil. Karena secara kenyataan satu entitas *equipment* utama bisa terdiri dari banyak susunan sub-komponen (yang mana tiap komponen dapat punya alamat jaringannya sendiri).

- [ ] Buat file/tabel `equipment_otentication_config`.
- [ ] Pastikan susunan kerangka datanya mengandung:
  - **`id`**: *String / UUID* (Bersifat *unique*)
  - **`name`**: *String* (Nama bagian spesifik per komponen. Contoh: "TX 1 VHF Primary" atau "RX 2")
  - **`equipt_id`**: *String / Relasi* (*Foreign Key*. Diisi secara mutlak oleh sistem mengambil nilai / me*lookup* `id` spesifik dari data *equipment* yang ada)
  - **`ip_address`**: *String (Format IP)* (Alamat IPv4 / IPv6 dari perangkat penunjang komponen untuk dikontak *backend*)

---

## 📝 5. Penciptaan Database / Koleksi `limitation_config`
Tabel mandiri penyimpan kriteria parameter batas keamanan angka alarm untuk toleransi sensor peralatan instrumen.

- [ ] Buat file/tabel bernama `limitation_config`. Format properti yang harus ada berupa:
  - **`id`**: *String / UUID* (Bersifat *unique*)
  - **`name`**: *String* (Indikator label, Contohnya: "[DDM] LLZ", atau "GP")
  - **`category`**: *String* (Nilai persis sama seperti *category* spesifik tipe alat tersebut)
  - **`equipt_id`**: *String / Relasi* (Merujuk *equipment id* mana limitasi parameter ini diberlakukan)
  - **`value`**: *Number / String* (Nilai normal idealnya. Contoh: "0")
  - **`wlv`**: *Number / String* (*Warning Low Value* / batas peringatan rendah. Contoh: "-2" ke bawah)
  - **`alv`**: *Number / String* (*Alarm Low Value* / toleransi minimum kegagalan. Contoh: "-4" ke bawah)
  - **`whv`**: *Number / String* (*Warning High Value* / batas peringatan atas. Contoh: "2")
  - **`ahv`**: *Number / String* (*Alarm High Value* / toleransi maksimum lonjakan. Contoh: "4")
- [ ] **Kebutuhan Form UI**: Terdapat rekayasa filter data. Pada *dropdown* *form input* untuk menyeleksi perangkat (`equipt_id`), opsi yang bisa dipilih hanya alat spesifik yang nilai kategorinya sesuai dan sejajar (*filter match*) dengan kategori (*Field Category*) yang sudah ditentukan sebelumnya oleh user.

---

## 📝 6. Standar Revamp Komponen UI (Form & Interface Detail View)
Syarat penyesuaian fungsional pada ranah tatap muka / antarmuka pengguna sehubungan lima perubahan backend di atas:

- [ ] **Halaman *Create/Update Equipment***
  - Form tidak diizinkan menggunakan isian teks manual statis lagi untuk *Category* & *Sub-category*, gantilah dengan *Select Dropdowns* yang dinamis (*dependent lists*).
  - Terdapat mekanisme penyisipan antarmuka ("*Add Sub-Category / Add Item*") yang berdekatan dengan *flow form* utama, agar transisi pembuatan baru tak merepotkan admin.
  - Untuk otentikasi UI (seperti pembuatan relasi data `equipment_otentication_config`) buatlah fitur semacam struktur *repeater box* atau list *Add IP component* agar berjejer menyatu dalam proses pendataan alat utamanya.
- [ ] **Halaman *Detail/View Equipment*** (Dashboard Spesifikasi Detail)
  - Buat bagian terpisah (segmentasi jelas) menjabarkan label sederhana alat (*Merk, type, keterangan, status aktif, status operasional*).
  - Tampilkan data turunan berupa bentuk **Tabel Bersarang / Nested Grid / Kartu** untuk menyuguhkan list IP yang masuk ke spesifikasi `equipment_otentication_config` si alat tersebut.
  - Sediakan panel / tabel rekapitulasi batasan *threshold* limitasi toleransinya (nilai wlv, alv, ahv, whv bersumber di entitas `limitation_config`) sehigga bisa dilihat tanpa perlu pindah buka menu lain.

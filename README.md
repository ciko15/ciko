# ciko
Belajar sync repository pada github

# My Full-Stack App

Aplikasi web full-stack sederhana menggunakan Node.js, Express.js, dan Vanilla JavaScript.

## 📋 Deskripsi

Aplikasi manajemen user dengan fitur:
- Tambah user baru
- Lihat daftar user
- Hapus user
- API RESTful untuk operasi CRUD

## 🛠️ Tech Stack

- **Backend**: Node.js + Express.js
- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Port**: 3000

## 📁 Struktur Proyek

```
my-fullstack-app/
├── package.json          # Konfigurasi proyek
├── server.js            # Server Express + API
├── node_modules/       # Dependencies (terinstal)
└── public/
    ├── index.html      # Halaman utama
    ├── style.css      # Styling UI
    └── app.js         # Frontend JavaScript
```

## 🔌 API Endpoints

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/users` | Ambil semua user |
| GET | `/api/users/:id` | Ambil user berdasarkan ID |
| POST | `/api/users` | Tambah user baru |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Hapus user |

## 📖 Cara Penggunaan

### Menghidupkan Server (Start)

```bash
# 1. Masuk ke direktori proyek
cd /Users/vickra/Documents/PHYTON/TOC\ Project/my-fullstack-app

# 2. Install dependencies (hanya pertama kali)
npm install

# 3. Jalankan server
npm start
```

Atau satu baris:
```bash
cd /Users/vickra/Documents/PHYTON/TOC\ Project/my-fullstack-app && npm start
```

**Catatan**: Server akan berjalan di `http://localhost:3000`

### Mematikan Server (Stop)

Ada beberapa cara untuk menghentikan server:

**Cara 1: Menggunakan Ctrl+C**
- Tekan `Ctrl + C` di terminal yang menjalankan server

**Cara 2: Menggunakan PID**
```bash
# Cari PID proses node
lsof -i :3000

# Matikan proses
kill <PID>
```

**Cara 3: Menggunakan pkill**
```bash
pkill -f "node server.js"
```

## 🚀 Menggunakan Aplikasi

1. Buka browser dan akses `http://localhost:3000`
2. **Tambah User**: Isi form Name dan Email, klik "Add User"
3. **Lihat User**: Klik "Load Users" untuk memperbarui daftar
4. **Hapus User**: Klik tombol "Delete" pada user yang ingin dihapus

## 📝 Sample Data

Aplikasi sudah menyediakan 2 sample user:
1. John Doe - john@example.com
2. Jane Smith - jane@example.com

---

*Dibuat menggunakan Node.js dan Express.js*

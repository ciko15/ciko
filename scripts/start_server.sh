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

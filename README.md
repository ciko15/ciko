# CIKO - Direct Equipment Monitoring (No Gateway)

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start server
npm start

# Or development mode
npm run dev
```

## 📱 Features

✅ **Direct Equipment Connection** - No gateway ping dependency  
✅ **Public Dashboard** - View stats without login  
✅ **Role-based Access**  
   - `admin/admin` → Equipment management  
   - `superadmin/superadmin` → Full templates access  

✅ **Live Auto-refresh** (20s intervals)  
✅ **Network Tools** - Ping, SNMP test, packet capture  
✅ **File Logging** - Hourly logs per equipment  

## 📍 Login (Optional - Sidebar)

```
Click User Panel → Login
admin/admin
superadmin/superadmin
```

## 🎯 Branch Deployment

App starts **directly** - monitors equipment IP only. Perfect for cabang install!

## 🛠️ API Endpoints

```
GET /api/equipment/stats     → Public dashboard
GET /api/airports           → Map data  
POST /api/ping/start        → Ping tool
```

## ✅ Status: Production Ready

**Gateway removal complete** - Direct connect works!

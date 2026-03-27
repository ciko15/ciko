# ciko
Belajar sync repository pada github

# TOC (Technical Operation Center) Monitoring System

A professional, high-performance monitoring and management system for airport technical equipment (Navigation, Communication, Surveillance), built with a modern backend and realtime dashboard.

## 📋 Features

- **Realtime Monitoring**: NOC-style dashboard with live status updates.
- **Multi-Protocol Support**: SNMP (v2c), ASTERIX (Radar), and RCMS (Custom Parser).
- **Branch Management**: Advanced filtering by Airport and Category.
- **Technical Diagnostics**: Integrated Ping, SNMP Walk, and Data Capturing tools.
- **Reporting**: Automated logs with time-series data storage.

## 🛠️ Technology Stack

- **Runtime**: [Bun](https://bun.sh/) (Fast all-in-one JavaScript runtime)
- **Backend Framework**: [ElysiaJS](https://elysiajs.com/) (Ergonomic, high-performance Bun framework)
- **Database**: MySQL / MariaDB (Relational data & JSON logs)
- **Frontend**: HTML5, CSS3, Vanilla JavaScript (Modern ES6+)
- **Protocols**: 
    - **SNMP**: Device monitoring (v2c).
    - **ASTERIX**: Radar/Surveillance data parsing.
    - **RCMS**: Custom TCP/UDP data packet parsing.

## 📁 System Architecture

```mermaid
graph TD
    Device[Equipment / Sensor] -->|SNMP/ASTERIX/TCP| Collector[Bun/Elysia Collector Service]
    Collector -->|Parsed Data| DB[(MySQL Database)]
    DB -->|Realtime Query| API[Elysia API Endpoints]
    API -->|JSON/WebSocket| Dashboard[NOC Dashboard / Monitoring Table]
    Dashboard -->|User Actions| API
```

## 🗄️ Database Schema & Types

| Table | Column | Type | Description |
|-------|--------|------|-------------|
| **airports** | `id` | INT (PK) | Unique ID for Airport/Branch. |
| | `name` | VARCHAR(100) | Name of the airport. |
| | `city` | VARCHAR(100) | City location. |
| | `lat/lng`| DECIMAL | Geographic coordinates. |
| **equipment** | `id` | INT (PK) | Unique equipment ID. |
| | `code` | VARCHAR(50) | Unique equipment code. |
| | `category`| VARCHAR(50) | Navigation, Communication, etc. |
| | `snmp_config`| JSON | SNMP settings (IP, OID, Port). |
| **equipment_logs** | `id` | INT (PK) | Log entry ID. |
| | `equipment_id`| INT (FK) | Reference to equipment. |
| | `data` | JSON | Parsed technical parameters. |
| | `logged_at`| TIMESTAMP | Time of data capture. |
| **users** | `username` | VARCHAR(50) | Unique login name. |
| | `role` | VARCHAR(50) | Permission level (admin, teknisi, etc.). |

## 📖 Standard Operating Procedure (SOP)

### 1. Login & Authentication
- Access the application via browser at `http://localhost:3100`.
- Enter your **Username** and **Password**.
- Complete the simple Captcha verification.

### 2. Monitoring Equipment
- Use the **Dashboard** to see the overall health of system.
- Use the **Cabang (Branch)** menu for a detailed table-view of all devices.
- Green status indicates **Normal**, Red indicates **Alarm/Disconnect**.
- **Important Note:** In `SIMULATION_MODE` (default when physical sensors are unreachable or not configured), the server activates the Data Generator. You will see values fluctuating realistically (using a Random Walk algorithm) to simulate active equipment for demonstration or testing purposes.

### 3. Adding New Equipment
- Navigate to the **Management** section.
- Fill in the equipment details, location (Airport), and connection type.
- For SNMP devices, select the appropriate **Template** (e.g., DME, DVOR, MOXA).

### 4. Diagnostics & Troubleshooting
- Use the **Ping** button to test network connectivity.
- **Tiered Ping Mechanism:** The system first pings the **Branch Gateway** (if configured). If the Gateway is down, it reports a "Gateway Offline" status and skips the direct equipment ping to prevent false-positives and reduce network waste.
- Use **SNMP Tools** to walk OIDs and verify specific sensor readings.
- Check **Equipment Logs** for historical trend analysis.

## 🚀 Backend Development & Migration to Bun

**NOTICE: Legacy Node.js Support (COMPLETED)**
The legacy Node.js server (`server.js` at the root directory) is now **FULLY DEPRECATED**. 
All functionality including API routes, surveillance receivers, and tiered diagnostics have been successfully ported to the `src/` directory using **Bun & ElysiaJS**.

### How Data Generators Work (For Junior Devs & AI)
When the system cannot connect to a physical hardware device (e.g., no gateway IP, or device offline), the backend will automatically fall back to the built-in **Simulators** (found in `src/utils/simulators.ts`).
1. **DVOR/DME**: Simulates complex binary/hex parameter structures (Voltages, RF Power, Delay) applying slight randomized changes every 60 seconds.
2. **SNMP**: Uses predefined templates from the database to construct mock OID responses based on the template's parameters.
The `fetchAndParseData` function ties this together, tricking the frontend into displaying a live animated device block.

### Running the App Locally

```bash
# Start development server with auto-reload (Bun & Elysia)
npm run dev:bun

# OR
bun run dev:bun

# Start production server
npm run start:bun
```

**Port**: Default running on `http://localhost:3100`

---
*Developed for TOC Management System*

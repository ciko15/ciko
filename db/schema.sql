-- Database Schema for SNMP Airport Management System

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user_cabang',
    branch_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Airports table
CREATE TABLE IF NOT EXISTS airports (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    lat DECIMAL(10, 7) NOT NULL,
    lng DECIMAL(10, 7) NOT NULL,
    parent_id INTEGER REFERENCES airports(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Equipment table
CREATE TABLE IF NOT EXISTS equipment (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    category VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Normal',
    airport_id INTEGER REFERENCES airports(id),
    branch_id INTEGER REFERENCES airports(id),
    description TEXT,
    snmp_config JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SNMP Templates table
CREATE TABLE IF NOT EXISTS snmp_templates (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    oid_base VARCHAR(100) NOT NULL,
    oid_mappings JSONB NOT NULL,
    category VARCHAR(50),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Equipment Logs table - stores historical data from all equipment (SNMP, JSON, etc.)
CREATE TABLE IF NOT EXISTS equipment_logs (
    id SERIAL PRIMARY KEY,
    equipment_id INTEGER REFERENCES equipment(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'snmp',
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for equipment_logs for faster queries
CREATE INDEX IF NOT EXISTS idx_equipment_logs_equipment ON equipment_logs(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_time ON equipment_logs(logged_at);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50)
);

-- Insert default categories
INSERT INTO categories (id, name, icon) VALUES 
    ('Communication', 'Communication', 'fa-tower-broadcast'),
    ('Navigation', 'Navigation', 'fa-compass'),
    ('Surveillance', 'Surveillance', 'fa-satellite-dish'),
    ('Data Processing', 'Data Processing', 'fa-server'),
    ('Support', 'Support', 'fa-bolt')
ON CONFLICT (id) DO NOTHING;

-- Insert default users
INSERT INTO users (username, password, name, role, branch_id) VALUES 
    ('admin', 'admin123', 'Administrator', 'admin', NULL),
    ('pusat', 'pusat123', 'User Pusat', 'user_pusat', NULL),
    ('teknisi_jayapura', 'teknisi123', 'Teknisi Jayapura', 'teknisi_cabang', 1),
    ('user_jayapura', 'user123', 'User Jayapura', 'user_cabang', 1),
    ('user', 'user123', 'User Biasa', 'user_cabang', 2)
ON CONFLICT (username) DO NOTHING;

-- Insert default airports (40 total - 13 existing + 27 new)
INSERT INTO airports (name, city, lat, lng, parent_id) VALUES 
    -- Existing 13 airports
    ('Sentani', 'Jayapura', -2.5768, 140.5164, NULL),
    ('Soekarno-Hatta', 'Jakarta', -6.1255, 106.6559, NULL),
    ('Husein Sastranegara', 'Bandung', -6.9006, 107.5768, NULL),
    ('Sultan Hasanuddin', 'Makassar', -5.0617, 119.4179, NULL),
    ('Sultan Babullah', 'Ternate', 0.8318, 127.3815, NULL),
    ('El Tari', 'Kupang', -10.1714, 123.6630, NULL),
    ('Kuala Namu', 'Medan', 3.6428, 98.6731, NULL),
    ('Juanda', 'Surabaya', -7.3798, 112.7866, NULL),
    ('Adisutjipto', 'Yogyakarta', -7.7881, 110.4317, NULL),
    ('Samsuddin Noor', 'Banjarmasin', -3.4423, 114.7622, NULL),
    ('Biak', 'Biak Numfor', -1.1907, 136.1079, 1),
    ('Oksibil', 'Pegunungan Bintang', -4.9041, 140.6283, 1),
    ('Timika', 'Mimika', -4.5287, 136.8784, 1),
    -- Papua Region - Wamena and Dekai (under Sentani/Jayapura)
    ('Wamena', 'Jayapura', -4.1025, 138.9429, 1),
    ('Dekai', 'Yahukimo', -4.8241, 139.7625, 41),
    -- Sumatera Region (9 airports)
    ('Sultan Malikussaleh', 'Banda Aceh', 5.5233, 95.4203, NULL),
    ('Minangkabau', 'Padang', -0.7867, 100.2809, NULL),
    ('Sultan Syarif Kasim II', 'Pekanbaru', 0.4610, 101.4445, NULL),
    ('Sultan Mahmud Badaruddin II', 'Palembang', -2.8981, 104.7000, NULL),
    ('Fatmawati Soekarno', 'Bengkulu', -3.8639, 102.3390, NULL),
    ('Radin Inten II', 'Bandar Lampung', -5.2423, 105.1789, NULL),
    ('Depati Amir', 'Pangkal Pinang', -2.1623, 106.1391, NULL),
    ('Raja Haji Fisabilillah', 'Tanjung Pinang', 0.9229, 104.5324, NULL),
    ('Hang Nadim', 'Batam', 1.1210, 104.1191, NULL),
    -- Jawa Region (4 airports)
    ('Halim Perdanakusuma', 'Jakarta', -6.2666, 106.8911, NULL),
    ('Adisumarmo', 'Solo', -7.5161, 110.7569, NULL),
    ('Ahmad Yani', 'Semarang', -6.9727, 110.3744, NULL),
    ('Blimbingsari', 'Banyuwangi', -8.3100, 114.3400, NULL),
    -- Kalimantan Region (3 airports)
    ('Supadio', 'Pontianak', -0.1500, 109.4039, NULL),
    ('APT Pranoto', 'Samarinda', -0.3744, 117.2656, NULL),
    ('Temindung', 'Samarinda', -0.4819, 117.1531, NULL),
    -- Sulawesi Region (2 airports)
    ('Sam Ratulangi', 'Manado', 1.5494, 124.9262, NULL),
    ('Mutiara SIS Al-Jufrie', 'Palu', -0.9183, 119.9097, NULL),
    -- Bali & Nusa Tenggara Region (3 airports)
    ('I Gusti Ngurah Rai', 'Denpasar', -8.7481, 115.1675, NULL),
    ('Lombok', 'Mataram', -8.7573, 116.2767, NULL),
    ('Frans Sales Lega', 'Ruteng', -8.5956, 120.4769, NULL),
    -- Maluku & Papua Region (6 airports)
    ('Pattimura', 'Ambon', -3.7103, 128.0897, NULL),
    ('Domine Eduard Osok', 'Sorong', -0.9267, 131.1211, NULL),
    ('Frans Kaisiepo', 'Biak', -1.1907, 136.1079, NULL),
    ('Fakfak', 'Fakfak', -2.9203, 132.3000, NULL),
    ('Rendani', 'Manokwari', -0.8917, 134.0519, NULL),
    ('Mopah', 'Merauke', -8.5203, 140.4181, NULL)
ON CONFLICT DO NOTHING;

-- Insert default equipment
INSERT INTO equipment (name, code, category, status, airport_id, description, snmp_config) VALUES 
    ('VHF Main Tower', 'COM-001', 'Communication', 'Normal', 2, 'VHF Transmitter for airport communication', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    ('Recorder', 'COM-002', 'Communication', 'Normal', 2, 'Voice recorder for ATC', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    ('D-ATIS', 'COM-003', 'Communication', 'Normal', 2, 'Digital Automatic Terminal Information Service', '{"enabled": true, "ip": "127.0.0.1", "port": 16100, "community": "moxa_ioThinx_4150", "templateId": "moxa_ioThinx_4150"}'),
    ('VHF Main Tower', 'COM-004', 'Communication', 'Normal', 8, 'VHF Transmitter for airport communication', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    ('Recorder', 'COM-005', 'Communication', 'Normal', 8, 'Voice recorder for ATC', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    ('D-ATIS', 'COM-006', 'Communication', 'Normal', 9, 'Digital Automatic Terminal Information Service', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    ('Localizer', 'NAV-001', 'Navigation', 'Normal', 2, 'ILS Localizer for landing guidance', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    ('Glide Path', 'NAV-002', 'Navigation', 'Normal', 2, 'ILS Glide Path for vertical guidance', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    ('DVOR', 'NAV-003', 'Navigation', 'Alert', 3, 'Doppler VOR for navigation', '{"enabled": true, "ip": "127.0.0.1", "port": 16100, "community": "moxa_ioThinx_4150", "templateId": "moxa_ioThinx_4150"}'),
    ('DME', 'NAV-004', 'Navigation', 'Normal', 2, 'Distance Measuring Equipment', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    ('Localizer', 'NAV-005', 'Navigation', 'Normal', 4, 'ILS Localizer for landing guidance', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    ('DVOR', 'NAV-006', 'Navigation', 'Normal', 9, 'Doppler VOR for navigation', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    ('Radar', 'SUR-001', 'Surveillance', 'Normal', 2, 'Primary Surveillance Radar', '{"enabled": true, "ip": "127.0.0.1", "port": 16100, "community": "radar_primary", "templateId": "radar_system"}'),
    ('ADSB', 'SUR-002', 'Surveillance', 'Normal', 2, 'Automatic Dependent Surveillance-Broadcast', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    ('Radar', 'SUR-003', 'Surveillance', 'Warning', 8, 'Primary Surveillance Radar', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    ('ADSB', 'SUR-004', 'Surveillance', 'Normal', 9, 'Automatic Dependent Surveillance-Broadcast', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    ('Genset', 'SUP-001', 'Support', 'Normal', 2, 'Backup power generator', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    ('UPS', 'SUP-002', 'Support', 'Normal', 2, 'Uninterruptible Power Supply', '{"enabled": true, "ip": "127.0.0.1", "port": 16100, "community": "moxa_ioThinx_4150", "templateId": "moxa_ioThinx_4150"}'),
    ('Supply Utama', 'SUP-003', 'Support', 'Normal', 2, 'Main power supply distribution', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    ('Genset', 'SUP-004', 'Support', 'Warning', 4, 'Backup power generator', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    ('UPS', 'SUP-005', 'Support', 'Normal', 4, 'Uninterruptible Power Supply', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    ('Supply Utama', 'SUP-006', 'Support', 'Normal', 11, 'Main power supply distribution', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    ('VHF Main Tower', 'COM-007', 'Communication', 'Normal', 1, 'VHF Transmitter', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    ('Radar', 'SUR-005', 'Surveillance', 'Normal', 1, 'Primary Surveillance Radar', '{"enabled": true, "ip": "127.0.0.1", "port": 16100, "community": "radar_primary", "templateId": "radar_system"}'),
    ('Genset', 'SUP-007', 'Support', 'Normal', 1, 'Backup power generator', '{"enabled": false, "ip": "", "port": 161, "community": "public", "templateId": ""}'),
    
    -- ====== 5 RADAR STATIONS (ASTERIX) - Papua Region ======
    ('RADAR Sentani', 'RADAR-SENTANI-001', 'Surveillance', 'Normal', 1, 'Primary Radar - ASTERIX CAT048', '{"enabled": true, "method": "asterix", "ip": "225.30.210.1", "port": 4001, "multicast_ip": "225.30.210.1", "lat": -2.599, "lng": 140.528, "templateId": "asterix_cat048"}'),
    ('RADAR Biak', 'RADAR-BIAK-001', 'Surveillance', 'Normal', 11, 'Primary Radar - ASTERIX CAT048', '{"enabled": true, "method": "asterix", "ip": "230.52.53.3", "port": 21053, "multicast_ip": "230.52.53.3", "lat": -1.187, "lng": 136.112, "templateId": "asterix_cat048"}'),
    ('RADAR Merauke', 'RADAR-MERAUKE-001', 'Surveillance', 'Normal', 52, 'Primary Radar - ASTERIX CAT048', '{"enabled": true, "method": "asterix", "ip": "230.52.53.5", "port": 21055, "multicast_ip": "230.52.53.5", "lat": -8.513, "lng": 140.411, "templateId": "asterix_cat048"}'),
    ('RADAR Sorong', 'RADAR-SORONG-001', 'Surveillance', 'Normal', 51, 'Primary Radar - ASTERIX CAT048', '{"enabled": true, "method": "asterix", "ip": "230.52.53.4", "port": 21054, "multicast_ip": "230.52.53.4", "lat": -0.891, "lng": 131.288, "templateId": "asterix_cat048"}'),
    ('RADAR Timika', 'RADAR-TIMIKA-001', 'Surveillance', 'Normal', 13, 'Primary Radar - ASTERIX CAT048', '{"enabled": true, "method": "asterix", "ip": "230.52.53.2", "port": 21052, "multicast_ip": "230.52.53.2", "lat": -4.528, "lng": 136.887, "templateId": "asterix_cat048"}'),
    
    -- ====== 13 ADS-B STATIONS - Papua Region ======
    ('ADS-B Sentani', 'ADSBS-SENTANI-001', 'Surveillance', 'Normal', 1, 'ADS-B Receiver - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "lat": -2.599, "lng": 140.528}'),
    ('ADS-B Biak', 'ADSBS-BIAK-001', 'Surveillance', 'Normal', 11, 'ADS-B Receiver - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "lat": -1.187, "lng": 136.112}'),
    ('ADS-B Merauke', 'ADSBS-MERAUKE-001', 'Surveillance', 'Normal', 52, 'ADS-B Receiver - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "lat": -8.513, "lng": 140.411}'),
    ('ADS-B Sorong', 'ADSBS-SORONG-001', 'Surveillance', 'Normal', 51, 'ADS-B Receiver - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "lat": -0.891, "lng": 131.288}'),
    ('ADS-B Timika', 'ADSBS-TIMIKA-001', 'Surveillance', 'Normal', 13, 'ADS-B Receiver - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "lat": -4.528, "lng": 136.887}'),
    ('ADS-B Nabire', 'ADSBS-NABIRE-001', 'Surveillance', 'Normal', 45, 'ADS-B Receiver - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "lat": -3.367, "lng": 135.500}'),
    ('ADS-B Senggeh', 'ADSBS-SENGGEH-001', 'Surveillance', 'Normal', 1, 'ADS-B Receiver - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "lat": -2.583, "lng": 140.817}'),
    ('ADS-B Elelim', 'ADSBS-ELIMIN-001', 'Surveillance', 'Normal', 44, 'ADS-B Receiver - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "lat": -4.083, "lng": 139.550}'),
    ('ADS-B Dekai', 'ADSBS-DEKAI-001', 'Surveillance', 'Normal', 42, 'ADS-B Receiver - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "lat": -4.824, "lng": 139.762}'),
    ('ADS-B Oksibil', 'ADSBS-OKSIBIL-001', 'Surveillance', 'Normal', 43, 'ADS-B Receiver - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "lat": -4.904, "lng": 140.628}'),
    ('ADS-B Wamena', 'ADSBS-WAMENA-001', 'Surveillance', 'Normal', 41, 'ADS-B Receiver - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "lat": -4.102, "lng": 138.943}'),
    ('ADS-B Kaimana', 'ADSBS-KAIMANA-001', 'Surveillance', 'Normal', 49, 'ADS-B Receiver - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "lat": -3.667, "lng": 133.733}'),
    ('ADS-B Manokwari', 'ADSBS-MANOKWARI-001', 'Surveillance', 'Normal', 50, 'ADS-B Receiver - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "lat": -0.892, "lng": 134.052}')
ON CONFLICT (code) DO NOTHING;

-- Insert default SNMP templates
INSERT INTO snmp_templates (id, name, description, oid_base, oid_mappings, is_default) VALUES 
    ('moxa_ioThinx_4150', 'MOXA ioThinx 4150', 'Industrial I/O Controller', '1.3.6.1.4.1.50000', 
     '{"deviceName": {"oid": "1.1.0", "type": "string", "label": "Device Name"}, "firmware": {"oid": "1.2.0", "type": "string", "label": "Firmware Version"}, "uptime": {"oid": "1.3.0", "type": "timeticks", "label": "System Uptime"}, "digitalInput_1": {"oid": "2.1.0", "type": "integer", "label": "Digital Input 1"}, "digitalInput_2": {"oid": "2.2.0", "type": "integer", "label": "Digital Input 2"}, "digitalInput_3": {"oid": "2.3.0", "type": "integer", "label": "Digital Input 3"}, "analogInput_1": {"oid": "3.1.0", "type": "integer", "label": "Analog Input 1"}, "analogInput_1_value": {"oid": "3.2.0", "type": "integer", "label": "Analog Input 1 Value"}, "analogInput_1_unit": {"oid": "3.3.0", "type": "string", "label": "Analog Input 1 Unit"}, "relayOutput_1": {"oid": "4.1.0", "type": "integer", "label": "Relay Output 1"}, "relayOutput_1_status": {"oid": "4.2.0", "type": "integer", "label": "Relay Output 1 Status"}, "powerStatus": {"oid": "5.1.1.0", "type": "integer", "label": "Power Status", "warningThreshold": 0, "criticalThreshold": 0}, "batteryStatus": {"oid": "5.1.2.0", "type": "integer", "label": "Battery Status"}, "temperature": {"oid": "6.1.0", "type": "integer", "label": "Temperature", "unit": "°C", "warningThreshold": 35, "criticalThreshold": 45}, "humidity": {"oid": "6.2.0", "type": "integer", "label": "Humidity", "unit": "%", "warningLow": 30, "warningHigh": 80, "criticalLow": 20, "criticalHigh": 90}, "alarmStatus": {"oid": "6.3.0", "type": "integer", "label": "Alarm Status", "warningThreshold": 1, "criticalThreshold": 2}}',
     true),
    ('generic_snmp', 'Generic SNMP Device', 'Standard SNMP device (RFC1213)', '1.3.6.1.2.1',
     '{"sysDescr": {"oid": "1.1.0", "type": "string", "label": "System Description"}, "sysUpTime": {"oid": "1.3.0", "type": "timeticks", "label": "System Uptime"}, "sysContact": {"oid": "1.4.0", "type": "string", "label": "System Contact"}, "sysName": {"oid": "1.5.0", "type": "string", "label": "System Name"}, "sysLocation": {"oid": "1.6.0", "type": "string", "label": "System Location"}}',
     true),
    ('radar_system', 'Radar System', 'Primary Surveillance Radar', '1.3.6.1.4.1.99991',
     '{"radarStatus": {"oid": "1.1.0", "type": "integer", "label": "Radar Status", "warningThreshold": 1, "criticalThreshold": 2}, "azimuth": {"oid": "2.1.0", "type": "integer", "label": "Azimuth Angle", "unit": "degrees"}, "range": {"oid": "2.2.0", "type": "integer", "label": "Range", "unit": "NM"}, "scanRate": {"oid": "2.3.0", "type": "integer", "label": "Scan Rate", "unit": "RPM"}, "powerOutput": {"oid": "3.1.0", "type": "integer", "label": "Power Output", "unit": "kW", "warningThreshold": 80, "criticalThreshold": 90}, "coolingStatus": {"oid": "3.2.0", "type": "integer", "label": "Cooling Status", "warningThreshold": 1, "criticalThreshold": 2}}',
     true)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- Airports indexes
CREATE INDEX IF NOT EXISTS idx_airports_parent ON airports(parent_id);
CREATE INDEX IF NOT EXISTS idx_airports_city ON airports(city);
CREATE INDEX IF NOT EXISTS idx_airports_name ON airports(name);

-- Equipment indexes (CRITICAL for performance)
CREATE INDEX IF NOT EXISTS idx_equipment_airport ON equipment(airport_id);
CREATE INDEX IF NOT EXISTS idx_equipment_branch ON equipment(branch_id);
CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(category);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
CREATE INDEX IF NOT EXISTS idx_equipment_code ON equipment(code);
CREATE INDEX IF NOT EXISTS idx_equipment_airport_category ON equipment(airport_id, category);

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- SNMP Templates indexes
CREATE INDEX IF NOT EXISTS idx_snmp_templates_default ON snmp_templates(is_default) WHERE is_default = true;

-- Create updated_at index for caching
CREATE INDEX IF NOT EXISTS idx_equipment_updated ON equipment(updated_at);

-- =====================================================
-- FUNCTIONS FOR PAGINATION
-- =====================================================

-- Function to count total records
CREATE OR REPLACE FUNCTION count_equipment(p_airport_id INTEGER, p_category VARCHAR)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM equipment e
    WHERE ($1 IS NULL OR e.airport_id = $1)
    AND ($2 IS NULL OR e.category = $2);
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

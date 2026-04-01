-- Full Database Schema for TOC Project
-- Database: MySQL (db_2)
-- Created: 2024

-- =====================================================
-- CREATE DATABASE
-- =====================================================
-- Note: Create database first in phpMyAdmin
-- CREATE DATABASE IF NOT EXISTS db_2 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- USE db_2;

-- =====================================================
-- 1. USERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user_cabang',
    branch_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- 2. AIRPORTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS airports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    lat DECIMAL(10, 7) NOT NULL,
    lng DECIMAL(10, 7) NOT NULL,
    parent_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES airports(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- 3. EQUIPMENT TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS equipment (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    category VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Normal',
    airport_id INT,
    branch_id INT,
    description TEXT,
    snmp_config JSON,
    connect_config_id INT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (airport_id) REFERENCES airports(id) ON DELETE SET NULL,
    FOREIGN KEY (branch_id) REFERENCES airports(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- 4. SNMP TEMPLATES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS snmp_templates (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    oid_base VARCHAR(100) NOT NULL,
    oid_mappings JSON NOT NULL,
    category VARCHAR(50),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- 5. EQUIPMENT LOGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS equipment_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    equipment_id INT,
    equipment_name VARCHAR(100),
    status VARCHAR(50),
    data JSON NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'snmp',
    raw_data BLOB,
    parsed_data JSON,
    connection_type VARCHAR(20) DEFAULT 'snmp',
    status_detail VARCHAR(50),
    airport_name VARCHAR(100),
    airport_city VARCHAR(100),
    changes JSON,
    data_quality VARCHAR(20) DEFAULT 'valid',
    threshold_applied BOOLEAN DEFAULT FALSE,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- 6. CATEGORIES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- 7. EQUIPMENT_CONNECT TABLE (BARU)
-- =====================================================

CREATE TABLE IF NOT EXISTS equipment_connect (
    id INT AUTO_INCREMENT PRIMARY KEY,
    equipment_id INT NOT NULL,
    connection_type VARCHAR(20) NOT NULL DEFAULT 'rcms',
    protocol VARCHAR(10) NOT NULL DEFAULT 'tcp',
    host VARCHAR(45) NOT NULL,
    port INT NOT NULL DEFAULT 950,
    rcms_format VARCHAR(20) DEFAULT 'hex_ascii',
    parser_config JSON NOT NULL,
    threshold_overrides JSON,
    is_enabled BOOLEAN DEFAULT TRUE,
    last_connected DATETIME,
    last_error VARCHAR(500),
    test_interval INT DEFAULT 60,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- 8. EQUIPMENT TEMPLATES TABLE (BARU)
-- =====================================================

CREATE TABLE IF NOT EXISTS equipment_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    equipment_type VARCHAR(20) NOT NULL,
    brand VARCHAR(50),
    model VARCHAR(50),
    parser_config JSON NOT NULL,
    default_thresholds JSON,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- 9. EQUIPMENT STATUS TABLE (BARU)
-- =====================================================

CREATE TABLE IF NOT EXISTS equipment_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    equipment_id INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Disconnect',
    status_detail VARCHAR(100),
    status_since TIMESTAMP NULL,
    current_data JSON,
    alarm_count INT DEFAULT 0,
    warning_count INT DEFAULT 0,
    total_packets INT DEFAULT 0,
    connection_status VARCHAR(20) DEFAULT 'Disconnect',
    last_connected TIMESTAMP NULL,
    last_error VARCHAR(500),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
    UNIQUE(equipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- 10. CONNECTION LOGS TABLE (BARU)
-- =====================================================

CREATE TABLE IF NOT EXISTS connection_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    equipment_id INT NOT NULL,
    connect_id INT,
    test_result VARCHAR(20) NOT NULL,
    response_time INT,
    error_message VARCHAR(500),
    tested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
    FOREIGN KEY (connect_id) REFERENCES equipment_connect(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- INDEXES
-- =====================================================

-- Airports indexes
CREATE INDEX idx_airports_parent ON airports(parent_id);
CREATE INDEX idx_airports_city ON airports(city);
CREATE INDEX idx_airports_name ON airports(name);

-- Equipment indexes
CREATE INDEX idx_equipment_airport ON equipment(airport_id);
CREATE INDEX idx_equipment_branch ON equipment(branch_id);
CREATE INDEX idx_equipment_category ON equipment(category);
CREATE INDEX idx_equipment_status ON equipment(status);
CREATE INDEX idx_equipment_code ON equipment(code);
CREATE INDEX idx_equipment_airport_category ON equipment(airport_id, category);

-- Users indexes
CREATE INDEX idx_users_branch ON users(branch_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_username ON users(username);

-- Equipment logs indexes
CREATE INDEX idx_equipment_logs_equipment ON equipment_logs(equipment_id);
CREATE INDEX idx_equipment_logs_time ON equipment_logs(logged_at);

-- Equipment connect indexes
CREATE INDEX idx_connect_equipment ON equipment_connect(equipment_id);
CREATE INDEX idx_connect_type ON equipment_connect(connection_type);
CREATE INDEX idx_connect_enabled ON equipment_connect(is_enabled);
CREATE INDEX idx_connect_host_port ON equipment_connect(host, port);

-- Equipment templates indexes
CREATE INDEX idx_templates_type ON equipment_templates(equipment_type);
CREATE INDEX idx_templates_brand ON equipment_templates(brand);
CREATE INDEX idx_templates_active ON equipment_templates(is_active);

-- Equipment status indexes
CREATE INDEX idx_status_equipment ON equipment_status(equipment_id);
CREATE INDEX idx_status_current ON equipment_status(status);
CREATE INDEX idx_status_connection ON equipment_status(connection_status);

-- Connection logs indexes
CREATE INDEX idx_conn_logs_equipment ON connection_logs(equipment_id);
CREATE INDEX idx_conn_logs_time ON connection_logs(tested_at DESC);

-- =====================================================
-- SEED DATA: DEFAULT CATEGORIES
-- =====================================================

INSERT INTO categories (id, name, icon) VALUES 
    ('Communication', 'Communication', 'fa-tower-broadcast'),
    ('Navigation', 'Navigation', 'fa-compass'),
    ('Surveillance', 'Surveillance', 'fa-satellite-dish'),
    ('Data Processing', 'Data Processing', 'fa-server'),
    ('Support', 'Support', 'fa-bolt');

-- =====================================================
-- SEED DATA: DEFAULT USERS
-- =====================================================

INSERT INTO users (username, password, name, role, branch_id) VALUES 
    ('admin', 'admin123', 'Administrator', 'admin', NULL),
    ('pusat', 'pusat123', 'User Pusat', 'user_pusat', NULL),
    ('teknisi_jayapura', 'teknisi123', 'Teknisi Jayapura', 'teknisi_cabang', 1),
    ('user_jayapura', 'user123', 'User Jayapura', 'user_cabang', 1),
    ('user', 'user123', 'User Biasa', 'user_cabang', 2);

-- =====================================================
-- SEED DATA: DEFAULT SNMP TEMPLATES
-- =====================================================

INSERT INTO snmp_templates (id, name, description, oid_base, oid_mappings, is_default) VALUES 
    ('moxa_ioThinx_4150', 'MOXA ioThinx 4150', 'Industrial I/O Controller', '1.3.6.1.4.1.50000', 
     '{"deviceName": {"oid": "1.1.0", "type": "string", "label": "Device Name"}, "firmware": {"oid": "1.2.0", "type": "string", "label": "Firmware Version"}, "uptime": {"oid": "1.3.0", "type": "timeticks", "label": "System Uptime"}, "temperature": {"oid": "6.1.0", "type": "integer", "label": "Temperature", "unit": "°C"}, "humidity": {"oid": "6.2.0", "type": "integer", "label": "Humidity", "unit": "%"}}',
     TRUE),
    ('generic_snmp', 'Generic SNMP Device', 'Standard SNMP device', '1.3.6.1.2.1',
     '{"sysDescr": {"oid": "1.1.0", "type": "string", "label": "System Description"}, "sysUpTime": {"oid": "1.3.0", "type": "timeticks", "label": "System Uptime"}}',
     TRUE),
    ('radar_system', 'Radar System', 'Primary Surveillance Radar', '1.3.6.1.4.1.99991',
     '{"radarStatus": {"oid": "1.1.0", "type": "integer", "label": "Radar Status"}, "azimuth": {"oid": "2.1.0", "type": "integer", "label": "Azimuth Angle"}, "powerOutput": {"oid": "3.1.0", "type": "integer", "label": "Power Output"}}',
     TRUE);

-- =====================================================
-- SEED DATA: EQUIPMENT TEMPLATES (RCMS/DME/DVOR)
-- =====================================================

INSERT INTO equipment_templates (name, equipment_type, brand, model, parser_config, is_system) VALUES
('DME L-3 Standard', 'dme', 'L-3', 'Model 450', 
'{
    "frame_header": {"soh": "01", "stx": "02", "etx": "03"},
    "mappings": [
        {"byte_offset": 0, "length": 2, "name": "sys_delay", "type": "uint16", "divisor": 100, "unit": "us", "label": "System Delay"},
        {"byte_offset": 2, "length": 2, "name": "m1_rise_a", "type": "uint16", "divisor": 100, "unit": "us", "label": "MON1 Rise Time A"},
        {"byte_offset": 16, "length": 2, "name": "m1_reply_eff", "type": "uint16", "divisor": 1, "unit": "%", "label": "MON1 Reply Efficiency"},
        {"byte_offset": 20, "length": 2, "name": "m1_fwd_power", "type": "uint16", "divisor": 10, "unit": "W", "label": "MON1 Forward Power"},
        {"byte_offset": 32, "length": 2, "name": "m2_sys_delay", "type": "uint16", "divisor": 100, "unit": "us", "label": "MON2 System Delay"},
        {"byte_offset": 48, "length": 2, "name": "m2_reply_eff", "type": "uint16", "divisor": 1, "unit": "%", "label": "MON2 Reply Efficiency"},
        {"byte_offset": 54, "length": 2, "name": "m2_fwd_power", "type": "uint16", "divisor": 10, "unit": "W", "label": "MON2 Forward Power"}
    ],
    "alarm_rules": [
        {"parameter": "m1_reply_eff", "operator": "lt", "value": 70, "severity": "alarm"},
        {"parameter": "m1_fwd_power", "operator": "lt", "value": 800, "severity": "alarm"},
        {"parameter": "m2_reply_eff", "operator": "lt", "value": 70, "severity": "alarm"},
        {"parameter": "m2_fwd_power", "operator": "lt", "value": 800, "severity": "alarm"}
    ]
}', TRUE),

('DVOR L-3 Standard', 'dvor', 'L-3', 'Model 480', 
'{
    "format": "tag",
    "tag_mappings": {
        "N1": {"S1": "m1_carrier_power", "S3": "m1_azimuth", "S14": "ident"},
        "N2": {"S1": "m2_carrier_power"},
        "LC": {"S25": "dc_28v", "S26": "dc_5v"}
    },
    "alarm_rules": [
        {"parameter": "m1_azimuth", "operator": "lt", "value": 116.5, "severity": "alarm"},
        {"parameter": "m1_azimuth", "operator": "gt", "value": 118.0, "severity": "alarm"},
        {"parameter": "m1_carrier_power", "operator": "lt", "value": 80, "severity": "alarm"}
    ]
}', TRUE),

('DVOR Indra Euro 2000', 'dvor', 'Indra', 'Euro 2000', 
'{
    "format": "tag",
    "tag_mappings": {
        "M1": {"P1": "m1_carrier_power", "A1": "m1_azimuth"},
        "M2": {"P1": "m2_carrier_power"},
        "PS": {"V1": "dc_28v"}
    },
    "alarm_rules": [
        {"parameter": "m1_azimuth", "operator": "lt", "value": 116.0, "severity": "alarm"},
        {"parameter": "m1_carrier_power", "operator": "lt", "value": 50, "severity": "alarm"}
    ]
}', TRUE),

('SNMP Standard', 'snmp', 'Generic', 'SNMP', 
'{"mappings": [], "alarm_rules": []}', TRUE);

-- =====================================================
-- END OF SCHEMA
-- =====================================================

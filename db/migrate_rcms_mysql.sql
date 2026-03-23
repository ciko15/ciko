-- Migration: Add RCMS/DVOR/DME Integration Tables
-- Database: MySQL (db_2)
-- Created: 2024

-- =====================================================
-- 1. MODIFY EQUIPMENT TABLE
-- =====================================================

-- Add connection config reference
ALTER TABLE equipment 
ADD COLUMN connect_config_id INT NULL,
ADD COLUMN is_active BOOLEAN DEFAULT TRUE;

-- =====================================================
-- 2. CREATE EQUIPMENT_CONNECT TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS equipment_connect (
    id INT AUTO_INCREMENT PRIMARY KEY,
    equipment_id INT NOT NULL,
    
    -- Connection Type
    connection_type VARCHAR(20) NOT NULL DEFAULT 'rcms',
    -- rcms, asterix, adsb, snmp, json, tcp, modbus
    
    -- Network Configuration
    protocol VARCHAR(10) NOT NULL DEFAULT 'tcp',
    -- tcp, udp, http, mqtt
    
    host VARCHAR(45) NOT NULL,
    port INT NOT NULL DEFAULT 950,
    
    -- RCMS Specific (for DME/DVOR)
    rcms_format VARCHAR(20) DEFAULT 'hex_ascii',
    -- hex_ascii, binary, custom
    
    -- Parser Configuration (JSON) - Flexible for different equipment
    parser_config JSON NOT NULL,
    
    -- Threshold Overrides (optional - override template defaults)
    threshold_overrides JSON,
    
    -- Status
    is_enabled BOOLEAN DEFAULT TRUE,
    last_connected DATETIME,
    last_error VARCHAR(500),
    
    -- Connection Test
    test_interval INT DEFAULT 60,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add foreign key to equipment table
ALTER TABLE equipment 
ADD CONSTRAINT fk_equipment_connect 
FOREIGN KEY (connect_config_id) REFERENCES equipment_connect(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX idx_connect_equipment ON equipment_connect(equipment_id);
CREATE INDEX idx_connect_type ON equipment_connect(connection_type);
CREATE INDEX idx_connect_enabled ON equipment_connect(is_enabled);
CREATE INDEX idx_connect_host_port ON equipment_connect(host, port);

-- =====================================================
-- 3. CREATE EQUIPMENT_TEMPLATES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS equipment_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    equipment_type VARCHAR(20) NOT NULL,
    -- dme, dvor, radar, other
    
    brand VARCHAR(50),
    model VARCHAR(50),
    
    -- Template parser config
    parser_config JSON NOT NULL,
    
    -- Default thresholds
    default_thresholds JSON,
    
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_system BOOLEAN DEFAULT FALSE,
    -- System templates cannot be deleted
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Index
CREATE INDEX idx_templates_type ON equipment_templates(equipment_type);
CREATE INDEX idx_templates_brand ON equipment_templates(brand);
CREATE INDEX idx_templates_active ON equipment_templates(is_active);

-- Insert default templates
INSERT INTO equipment_templates (name, equipment_type, brand, model, parser_config, is_system) VALUES
('DME L-3 Standard', 'dme', 'L-3', 'Model 450', 
'{
    "frame_header": {"soh": "01", "stx": "02", "etx": "03"},
    "mappings": [
        {"byte_offset": 0, "length": 2, "name": "sys_delay", "type": "uint16", "divisor": 100, "unit": "us", "label": "System Delay"},
        {"byte_offset": 2, "length": 2, "name": "m1_rise_a", "type": "uint16", "divisor": 100, "unit": "us", "label": "MON1 Rise Time A"},
        {"byte_offset": 4, "length": 2, "name": "m1_rise_b", "type": "uint16", "divisor": 100, "unit": "us", "label": "MON1 Rise Time B"},
        {"byte_offset": 16, "length": 2, "name": "m1_reply_eff", "type": "uint16", "divisor": 1, "unit": "%", "label": "MON1 Reply Efficiency"},
        {"byte_offset": 20, "length": 2, "name": "m1_fwd_power", "type": "uint16", "divisor": 10, "unit": "W", "label": "MON1 Forward Power"},
        {"byte_offset": 32, "length": 2, "name": "m2_sys_delay", "type": "uint16", "divisor": 100, "unit": "us", "label": "MON2 System Delay"},
        {"byte_offset": 48, "length": 2, "name": "m2_reply_eff", "type": "uint16", "divisor": 1, "unit": "%", "label": "MON2 Reply Efficiency"},
        {"byte_offset": 54, "length": 2, "name": "m2_fwd_power", "type": "uint16", "divisor": 10, "unit": "W", "label": "MON2 Forward Power"},
        {"byte_offset": 94, "length": 3, "name": "ident", "type": "ascii", "unit": "", "label": "Ident"}
    ],
    "alarm_rules": [
        {"parameter": "m1_reply_eff", "operator": "lt", "value": 70, "severity": "alarm", "message": "MON1 Reply Efficiency too low"},
        {"parameter": "m1_fwd_power", "operator": "lt", "value": 800, "severity": "alarm", "message": "MON1 Forward Power too low"},
        {"parameter": "m2_reply_eff", "operator": "lt", "value": 70, "severity": "alarm", "message": "MON2 Reply Efficiency too low"},
        {"parameter": "m2_fwd_power", "operator": "lt", "value": 800, "severity": "alarm", "message": "MON2 Forward Power too low"},
        {"parameter": "m1_sys_delay", "operator": "lt", "value": 49.5, "severity": "warning", "message": "MON1 System Delay below normal"},
        {"parameter": "m1_sys_delay", "operator": "gt", "value": 50.5, "severity": "warning", "message": "MON1 System Delay above normal"}
    ]
}', TRUE),

('DVOR L-3 Standard', 'dvor', 'L-3', 'Model 480', 
'{
    "format": "tag",
    "tag_mappings": {
        "N1": {
            "params": {
                "S1": {"name": "m1_carrier_power", "type": "float", "divisor": 10, "unit": "W", "label": "MON1 Carrier Power"},
                "S2": {"name": "m1_rf_input", "type": "float", "unit": "dBm", "label": "MON1 RF Input"},
                "S3": {"name": "m1_azimuth", "type": "float", "unit": "deg", "label": "MON1 Azimuth"},
                "S4": {"name": "m1_carrier_freq", "type": "float", "unit": "MHz", "label": "MON1 Carrier Freq"},
                "S10": {"name": "m1_30hz_am", "type": "float", "divisor": 10, "unit": "%", "label": "MON1 30Hz AM"},
                "S11": {"name": "m1_9960hz_am", "type": "float", "divisor": 10, "unit": "%", "label": "MON1 9960Hz AM"},
                "S12": {"name": "m1_1020hz_am", "type": "float", "divisor": 10, "unit": "%", "label": "MON1 1020Hz AM"},
                "S14": {"name": "ident", "type": "string", "unit": "", "label": "Ident"}
            }
        },
        "N2": {
            "params": {
                "S1": {"name": "m2_carrier_power", "type": "float", "divisor": 10, "unit": "W", "label": "MON2 Carrier Power"},
                "S2": {"name": "m2_rf_input", "type": "float", "unit": "dBm", "label": "MON2 RF Input"},
                "S3": {"name": "m2_azimuth", "type": "float", "unit": "deg", "label": "MON2 Azimuth"}
            }
        },
        "LC": {
            "params": {
                "S26": {"name": "dc_5v", "type": "float", "unit": "V", "label": "DC +5V"},
                "S27": {"name": "dc_7v", "type": "float", "unit": "V", "label": "DC +7V"},
                "S28": {"name": "dc_15v", "type": "float", "unit": "V", "label": "DC +15V"},
                "S25": {"name": "dc_28v", "type": "float", "unit": "V", "label": "DC +28V"},
                "S47": {"name": "ac_28v", "type": "float", "unit": "V", "label": "AC +28V"}
            }
        }
    },
    "alarm_rules": [
        {"parameter": "m1_azimuth", "operator": "lt", "value": 116.5, "severity": "alarm", "message": "MON1 Azimuth too low"},
        {"parameter": "m1_azimuth", "operator": "gt", "value": 118.0, "severity": "alarm", "message": "MON1 Azimuth too high"},
        {"parameter": "m1_carrier_power", "operator": "lt", "value": 80, "severity": "alarm", "message": "MON1 Carrier Power too low"},
        {"parameter": "dc_28v", "operator": "lt", "value": 25, "severity": "alarm", "message": "DC +28V too low"}
    ]
}', TRUE),

('DVOR Indra Euro 2000', 'dvor', 'Indra', 'Euro 2000', 
'{
    "format": "tag",
    "tag_mappings": {
        "M1": {
            "params": {
                "P1": {"name": "m1_carrier_power", "type": "float", "divisor": 10, "unit": "W", "label": "MON1 Carrier Power"},
                "A1": {"name": "m1_azimuth", "type": "float", "unit": "deg", "label": "MON1 Azimuth"}
            }
        },
        "M2": {
            "params": {
                "P1": {"name": "m2_carrier_power", "type": "float", "divisor": 10, "unit": "W", "label": "MON2 Carrier Power"}
            }
        },
        "PS": {
            "params": {
                "V1": {"name": "dc_28v", "type": "float", "unit": "V", "label": "DC +28V"}
            }
        }
    },
    "alarm_rules": [
        {"parameter": "m1_azimuth", "operator": "lt", "value": 116.0, "severity": "alarm", "message": "MON1 Azimuth too low"},
        {"parameter": "m1_carrier_power", "operator": "lt", "value": 50, "severity": "alarm", "message": "MON1 Carrier Power too low"}
    ]
}', TRUE),

('SNMP Standard', 'snmp', 'Generic', 'SNMP', 
'{
    "mappings": [],
    "alarm_rules": []
}', TRUE);

-- =====================================================
-- 4. CREATE EQUIPMENT_STATUS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS equipment_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    equipment_id INT NOT NULL,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'Disconnect',
    -- Normal, Warning, Alarm, Disconnect
    
    status_detail VARCHAR(100),
    status_since TIMESTAMP NULL,
    
    -- Real-time data (latest)
    current_data JSON,
    
    -- Counters
    alarm_count INT DEFAULT 0,
    warning_count INT DEFAULT 0,
    total_packets INT DEFAULT 0,
    
    -- Connection info
    connection_status VARCHAR(20) DEFAULT 'Disconnect',
    -- Connected, Disconnect, Testing
    last_connected TIMESTAMP NULL,
    last_error VARCHAR(500),
    
    -- WebSocket sync
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
    UNIQUE(equipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Indexes
CREATE INDEX idx_status_equipment ON equipment_status(equipment_id);
CREATE INDEX idx_status_current ON equipment_status(status);
CREATE INDEX idx_status_connection ON equipment_status(connection_status);

-- =====================================================
-- 5. UPDATE EQUIPMENT_LOGS TABLE
-- =====================================================

-- Add columns if not exist
ALTER TABLE equipment_logs 
ADD COLUMN raw_data BLOB,
ADD COLUMN parsed_data JSON,
ADD COLUMN connection_type VARCHAR(20) DEFAULT 'snmp',
ADD COLUMN status_detail VARCHAR(50);

-- =====================================================
-- 6. CREATE CONNECTION TEST LOG TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS connection_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    equipment_id INT NOT NULL,
    connect_id INT,
    
    -- Test result
    test_result VARCHAR(20) NOT NULL,
    -- success, timeout, refused, error
    
    response_time INT,
    -- milliseconds
    
    error_message VARCHAR(500),
    
    tested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
    FOREIGN KEY (connect_id) REFERENCES equipment_connect(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Index
CREATE INDEX idx_conn_logs_equipment ON connection_logs(equipment_id);
CREATE INDEX idx_conn_logs_time ON connection_logs(tested_at DESC);

-- =====================================================
-- END OF MIGRATION
-- =====================================================

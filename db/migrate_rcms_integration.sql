-- Migration: Add RCMS/DVOR/DME Integration Tables
-- Created: 2024

-- =====================================================
-- 1. MODIFY EQUIPMENT TABLE
-- =====================================================

-- Add connection config reference
ALTER TABLE equipment 
ADD COLUMN IF NOT EXISTS connect_config_id INTEGER,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add foreign key constraint (if not exists)
-- Note: Will be added after equipment_connect table is created

-- =====================================================
-- 2. CREATE EQUIPMENT_CONNECT TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS equipment_connect (
    id SERIAL PRIMARY KEY,
    equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    
    -- Connection Type
    connection_type VARCHAR(20) NOT NULL DEFAULT 'rcms',
    -- rcms, asterix, adsb, snmp, json, tcp, modbus
    
    -- Network Configuration
    protocol VARCHAR(10) NOT NULL DEFAULT 'tcp',
    -- tcp, udp, http, mqtt
    
    host VARCHAR(45) NOT NULL,
    port INTEGER NOT NULL DEFAULT 950,
    
    -- RCMS Specific (for DME/DVOR)
    rcms_format VARCHAR(20) DEFAULT 'hex_ascii',
    -- hex_ascii, binary, custom
    
    -- Parser Configuration (JSON) - Flexible for different equipment
    parser_config JSONB NOT NULL,
    -- {
    --   "frame_header": {"soh": "01", "stx": "02", "etx": "03"},
    --   "mappings": [
    --     {"byte_offset": 0, "length": 2, "name": "sys_delay", "type": "uint16", "divisor": 100, "unit": "us"},
    --     {"byte_offset": 16, "length": 2, "name": "reply_eff", "type": "uint16", "divisor": 1, "unit": "%"}
    --   ],
    --   "alarm_rules": [
    --     {"parameter": "reply_eff", "operator": "lt", "value": 70, "severity": "alarm"},
    --     {"parameter": "fwd_power", "operator": "lt", "value": 800, "severity": "alarm"}
    --   ]
    -- }
    
    -- Threshold Overrides (optional - override template defaults)
    threshold_overrides JSONB,
    
    -- Status
    is_enabled BOOLEAN DEFAULT TRUE,
    last_connected TIMESTAMP,
    last_error VARCHAR(500),
    
    -- Connection Test
    test_interval INTEGER DEFAULT 60,
    -- Test connection every X seconds
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key after table exists
ALTER TABLE equipment 
ADD CONSTRAINT fk_equipment_connect 
FOREIGN KEY (connect_config_id) REFERENCES equipment_connect(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_connect_equipment ON equipment_connect(equipment_id);
CREATE INDEX IF NOT EXISTS idx_connect_type ON equipment_connect(connection_type);
CREATE INDEX IF NOT EXISTS idx_connect_enabled ON equipment_connect(is_enabled);
CREATE INDEX IF NOT EXISTS idx_connect_host_port ON equipment_connect(host, port);

-- =====================================================
-- 3. CREATE EQUIPMENT_TEMPLATES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS equipment_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    equipment_type VARCHAR(20) NOT NULL,
    -- dme, dvor, radar, other
    
    brand VARCHAR(50),
    model VARCHAR(50),
    
    -- Template parser config
    parser_config JSONB NOT NULL,
    
    -- Default thresholds
    default_thresholds JSONB,
    
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_system BOOLEAN DEFAULT FALSE,
    -- System templates cannot be deleted
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index
CREATE INDEX IF NOT EXISTS idx_templates_type ON equipment_templates(equipment_type);
CREATE INDEX IF NOT EXISTS idx_templates_brand ON equipment_templates(brand);
CREATE INDEX IF NOT EXISTS idx_templates_active ON equipment_templates(is_active);

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
}', true),

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
}', true),

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
}', true),

('SNMP Standard', 'snmp', 'Generic', 'SNMP', 
'{
    "mappings": [],
    "alarm_rules": []
}', true)
ON CONFLICT DO NOTHING;

-- =====================================================
-- 4. CREATE EQUIPMENT_STATUS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS equipment_status (
    id SERIAL PRIMARY KEY,
    equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'Disconnect',
    -- Normal, Warning, Alarm, Disconnect
    
    status_detail VARCHAR(100),
    status_since TIMESTAMP,
    
    -- Real-time data (latest)
    current_data JSONB,
    
    -- Counters
    alarm_count INTEGER DEFAULT 0,
    warning_count INTEGER DEFAULT 0,
    total_packets INTEGER DEFAULT 0,
    
    -- Connection info
    connection_status VARCHAR(20) DEFAULT 'Disconnect',
    -- Connected, Disconnect, Testing
    last_connected TIMESTAMP,
    last_error VARCHAR(500),
    
    -- WebSocket sync
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(equipment_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_status_equipment ON equipment_status(equipment_id);
CREATE INDEX IF NOT EXISTS idx_status_current ON equipment_status(status);
CREATE INDEX IF NOT EXISTS idx_status_connection ON equipment_status(connection_status);

-- =====================================================
-- 5. UPDATE EQUIPMENT_LOGS TABLE
-- =====================================================

-- Add columns if not exist
ALTER TABLE equipment_logs 
ADD COLUMN IF NOT EXISTS raw_data BYTEA,
ADD COLUMN IF NOT EXISTS parsed_data JSONB,
ADD COLUMN IF NOT EXISTS connection_type VARCHAR(20) DEFAULT 'snmp',
ADD COLUMN IF NOT EXISTS status_detail VARCHAR(50);

-- Update source values for new connection types
-- This is automatically handled by the application

-- =====================================================
-- 6. CREATE CONNECTION TEST LOG TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS connection_logs (
    id SERIAL PRIMARY KEY,
    equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    connect_id INTEGER REFERENCES equipment_connect(id) ON DELETE SET NULL,
    
    -- Test result
    test_result VARCHAR(20) NOT NULL,
    -- success, timeout, refused, error
    
    response_time INTEGER,
    -- milliseconds
    
    error_message VARCHAR(500),
    
    tested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index
CREATE INDEX IF NOT EXISTS idx_conn_logs_equipment ON connection_logs(equipment_id);
CREATE INDEX IF NOT EXISTS idx_conn_logs_time ON connection_logs(tested_at DESC);

-- =====================================================
-- END OF MIGRATION
-- =====================================================

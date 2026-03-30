-- Surveillance System Database Migration for MySQL
-- Adds tables for RADAR (ASTERIX) and ADS-B surveillance

-- =====================================================
-- Table: surveillance_stations
-- =====================================================
CREATE TABLE IF NOT EXISTS surveillance_stations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL,
    ip VARCHAR(50) NOT NULL,
    port INTEGER NOT NULL,
    multicast_ip VARCHAR(50),
    lat DECIMAL(10, 7),
    lng DECIMAL(10, 7),
    airport_id INTEGER,
    is_active BOOLEAN DEFAULT true,
    config JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (airport_id) REFERENCES airports(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Index for surveillance_stations
CREATE INDEX idx_surveillance_airport ON surveillance_stations(airport_id);
CREATE INDEX idx_surveillance_type ON surveillance_stations(type);
CREATE INDEX idx_surveillance_active ON surveillance_stations(is_active);

-- =====================================================
-- Table: radar_targets
-- Real-time radar targets from ASTERIX
-- =====================================================
CREATE TABLE IF NOT EXISTS radar_targets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    station_id INTEGER,
    target_number INTEGER,
    sac INTEGER,
    sic INTEGER,
    mode3_a VARCHAR(4),
    flight_level DECIMAL(6, 2),
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    callsign VARCHAR(10),
    target_address VARCHAR(6),
    time_of_day INTEGER,
    raw_data JSON,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (station_id) REFERENCES surveillance_stations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Index for radar_targets
CREATE INDEX idx_radar_targets_station ON radar_targets(station_id);
CREATE INDEX idx_radar_targets_time ON radar_targets(logged_at);
CREATE INDEX idx_radar_targets_mode3a ON radar_targets(mode3_a);

-- =====================================================
-- Table: adsb_aircraft
-- Real-time aircraft from ADS-B
-- =====================================================
CREATE TABLE IF NOT EXISTS adsb_aircraft (
    id INT AUTO_INCREMENT PRIMARY KEY,
    icao24 VARCHAR(6) NOT NULL,
    callsign VARCHAR(10),
    sac INTEGER,
    sic INTEGER,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    altitude INTEGER,
    ground_speed INTEGER,
    heading INTEGER,
    vertical_rate INTEGER,
    category VARCHAR(10),
    emitter_type INTEGER,
    station_id INTEGER,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (station_id) REFERENCES surveillance_stations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Index for adsb_aircraft
CREATE INDEX idx_adsb_icao ON adsb_aircraft(icao24);
CREATE INDEX idx_adsb_station ON adsb_aircraft(station_id);
CREATE INDEX idx_adsb_time ON adsb_aircraft(logged_at);
CREATE INDEX idx_adsb_callsign ON adsb_aircraft(callsign);

-- =====================================================
-- Table: surveillance_logs
-- Historical logs for surveillance systems
-- =====================================================
CREATE TABLE IF NOT EXISTS surveillance_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    station_id INTEGER,
    log_type VARCHAR(20) NOT NULL,
    message TEXT,
    severity VARCHAR(10) DEFAULT 'info',
    data JSON,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (station_id) REFERENCES surveillance_stations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Index for surveillance_logs
CREATE INDEX idx_surveillance_logs_station ON surveillance_logs(station_id);
CREATE INDEX idx_surveillance_logs_time ON surveillance_logs(logged_at);
CREATE INDEX idx_surveillance_logs_type ON surveillance_logs(log_type);

-- =====================================================
-- Update equipment table for MySQL
-- =====================================================
-- Check if column exists before adding (using a safer approach for MySQL version 8.0+)
-- Actually, the easiest is to just use ALTER TABLE IGNORE or check in a procedure
-- But normally we just run it and catch error if already exists.
ALTER TABLE equipment ADD COLUMN surveillance_config JSON;

-- =====================================================
-- End of migration
-- =====================================================

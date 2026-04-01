-- Surveillance System Database Migration
-- Adds tables for RADAR (ASTERIX) and ADS-B surveillance

-- =====================================================
-- Table: surveillance_stations
-- =====================================================
CREATE TABLE IF NOT EXISTS surveillance_stations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('radar', 'adsb', 'mlat')),
    ip VARCHAR(50) NOT NULL,
    port INTEGER NOT NULL,
    multicast_ip VARCHAR(50),
    lat DECIMAL(10, 7),
    lng DECIMAL(10, 7),
    airport_id INTEGER REFERENCES airports(id),
    is_active BOOLEAN DEFAULT true,
    config JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for surveillance_stations
CREATE INDEX IF NOT EXISTS idx_surveillance_airport ON surveillance_stations(airport_id);
CREATE INDEX IF NOT EXISTS idx_surveillance_type ON surveillance_stations(type);
CREATE INDEX IF NOT EXISTS idx_surveillance_active ON surveillance_stations(is_active);

-- =====================================================
-- Table: radar_targets
-- Real-time radar targets from ASTERIX
-- =====================================================
CREATE TABLE IF NOT EXISTS radar_targets (
    id SERIAL PRIMARY KEY,
    station_id INTEGER REFERENCES surveillance_stations(id) ON DELETE CASCADE,
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
    raw_data JSONB,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for radar_targets
CREATE INDEX IF NOT EXISTS idx_radar_targets_station ON radar_targets(station_id);
CREATE INDEX IF NOT EXISTS idx_radar_targets_time ON radar_targets(logged_at);
CREATE INDEX IF NOT EXISTS idx_radar_targets_mode3a ON radar_targets(mode3_a);

-- =====================================================
-- Table: adsb_aircraft
-- Real-time aircraft from ADS-B
-- =====================================================
CREATE TABLE IF NOT EXISTS adsb_aircraft (
    id SERIAL PRIMARY KEY,
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
    station_id INTEGER REFERENCES surveillance_stations(id),
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for adsb_aircraft
CREATE INDEX IF NOT EXISTS idx_adsb_icao ON adsb_aircraft(icao24);
CREATE INDEX IF NOT EXISTS idx_adsb_station ON adsb_aircraft(station_id);
CREATE INDEX IF NOT EXISTS idx_adsb_time ON adsb_aircraft(logged_at);
CREATE INDEX IF NOT EXISTS idx_adsb_callsign ON adsb_aircraft(callsign);

-- =====================================================
-- Table: surveillance_logs
-- Historical logs for surveillance systems
-- =====================================================
CREATE TABLE IF NOT EXISTS surveillance_logs (
    id SERIAL PRIMARY KEY,
    station_id INTEGER REFERENCES surveillance_stations(id) ON DELETE CASCADE,
    log_type VARCHAR(20) NOT NULL,
    message TEXT,
    severity VARCHAR(10) DEFAULT 'info',
    data JSONB,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for surveillance_logs
CREATE INDEX IF NOT EXISTS idx_surveillance_logs_station ON surveillance_logs(station_id);
CREATE INDEX IF NOT EXISTS idx_surveillance_logs_time ON surveillance_logs(logged_at);
CREATE INDEX IF NOT EXISTS idx_surveillance_logs_type ON surveillance_logs(log_type);

-- =====================================================
-- Insert default surveillance stations for Papua
-- =====================================================

-- RADAR Stations
INSERT INTO surveillance_stations (name, type, ip, port, multicast_ip, lat, lng, airport_id, config) VALUES 
    ('Sentani Radar', 'radar', '225.30.210.1', 4001, '225.30.210.1', -2.599, 140.528, 1, 
     '{"category": "Primary", "range": 250, "antenna": "PAR", "provider": "Airnav"}'),
    ('Biak Radar', 'radar', '230.52.53.3', 21053, '230.52.53.3', -1.187, 136.112, 11,
     '{"category": "Primary", "range": 200, "antenna": "PSR", "provider": "Airnav"}'),
    ('Merauke Radar', 'radar', '230.52.53.5', 21055, '230.52.53.5', -8.513, 140.411, NULL,
     '{"category": "Primary", "range": 150, "antenna": "PSR", "provider": "Airnav"}'),
    ('Sorong Radar', 'radar', '230.52.53.4', 21054, '230.52.53.4', -0.891, 131.288, NULL,
     '{"category": "Primary", "range": 180, "antenna": "PSR", "provider": "Airnav"}'),
    ('Timika Radar', 'radar', '230.52.53.2', 21052, '230.52.53.2', -4.528, 136.887, 13,
     '{"category": "Primary", "range": 200, "antenna": "PAR", "provider": "Airnav"}')
ON CONFLICT DO NOTHING;

-- ADS-B Stations
INSERT INTO surveillance_stations (name, type, ip, port, multicast_ip, lat, lng, airport_id, config) VALUES 
    ('Sentani ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -2.599, 140.528, 1,
     '{"provider": "Airnav", "coverage": "Papua"}'),
    ('Biak ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -1.187, 136.112, 11,
     '{"provider": "Airnav", "coverage": "Papua"}'),
    ('Merauke ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -8.513, 140.411, NULL,
     '{"provider": "Airnav", "coverage": "Papua"}'),
    ('Sorong ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -0.891, 131.288, NULL,
     '{"provider": "Airnav", "coverage": "Papua"}'),
    ('Timika ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -4.528, 136.887, 13,
     '{"provider": "Airnav", "coverage": "Papua"}'),
    ('Nabire ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -3.367, 135.633, NULL,
     '{"provider": "Airnav", "coverage": "Papua"}'),
    ('Senggeh ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -2.883, 132.867, NULL,
     '{"provider": "Airnav", "coverage": "Papua"}'),
    ('Elelim ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -3.433, 133.867, NULL,
     '{"provider": "Airnav", "coverage": "Papua"}'),
    ('Dekai ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -4.824, 139.762, NULL,
     '{"provider": "Airnav", "coverage": "Papua"}'),
    ('Oksibil ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -4.904, 140.628, 12,
     '{"provider": "Airnav", "coverage": "Papua"}'),
    ('Wamena ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -4.102, 138.943, NULL,
     '{"provider": "Airnav", "coverage": "Papua"}'),
    ('Kaimana ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -3.645, 133.845, NULL,
     '{"provider": "Airnav", "coverage": "Papua"}'),
    ('Manokwari ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -0.891, 134.052, NULL,
     '{"provider": "Airnav", "coverage": "Papua"}')
ON CONFLICT DO NOTHING;

-- =====================================================
-- Update equipment table to support surveillance config
-- =====================================================
-- This adds JSONB column for surveillance-specific configuration
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS surveillance_config JSONB;

-- =====================================================
-- Function to clean old surveillance data
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_surveillance_data()
RETURNS void AS $$
BEGIN
    -- Delete radar targets older than 1 hour
    DELETE FROM radar_targets WHERE logged_at < NOW() - INTERVAL '1 hour';
    
    -- Delete ADS-B aircraft older than 5 minutes (they expire faster)
    DELETE FROM adsb_aircraft WHERE logged_at < NOW() - INTERVAL '5 minutes';
    
    -- Delete surveillance logs older than 7 days
    DELETE FROM surveillance_logs WHERE logged_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Create cleanup job (if pg_cron available)
-- =====================================================
-- Note: Requires pg_cron extension
-- SELECT cron.schedule('cleanup-surveillance', '*/15 * * * *', 'SELECT cleanup_surveillance_data()');

-- =====================================================
-- End of migration
-- =====================================================


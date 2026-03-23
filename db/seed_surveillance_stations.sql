-- Seed Surveillance Stations for Papua Region
-- Run this file to add radar and ADS-B stations

-- First, let's check what airports exist in Papua region
-- Based on the schema, we need to find the correct airport IDs

-- Insert Radar Stations (5 Papua Radar Stations)
INSERT INTO surveillance_stations (name, type, ip, port, multicast_ip, lat, lng, airport_id, is_active, config) VALUES 
-- Sentani Radar (ID 1 in airports)
('Sentani Radar', 'radar', '225.30.210.1', 4001, '225.30.210.1', -2.599, 140.528, 1, true, '{"category": "Primary Radar", "manufacturer": "ATCRDS", "model": "ASR-23"}'),
-- Biak Radar (airport_id 11 based on schema)
('Biak Radar', 'radar', '230.52.53.3', 21053, '230.52.53.3', -1.187, 136.112, 11, true, '{"category": "Primary Radar", "manufacturer": "ATCRDS", "model": "ASR-23"}'),
-- Merauke Radar (Need to find correct airport_id)
('Merauke Radar', 'radar', '230.52.53.5', 21055, '230.52.53.5', -8.513, 140.411, (SELECT id FROM airports WHERE name = 'Mopah' LIMIT 1), true, '{"category": "Primary Radar", "manufacturer": "ATCRDS", "model": "ASR-23"}'),
-- Sorong Radar (airport_id 51 based on schema)
('Sorong Radar', 'radar', '230.52.53.4', 21054, '230.52.53.4', -0.891, 131.288, (SELECT id FROM airports WHERE name = 'Domine Eduard Osok' LIMIT 1), true, '{"category": "Primary Radar", "manufacturer": "ATCRDS", "model": "ASR-23"}'),
-- Timika Radar (airport_id 13 based on schema)
('Timika Radar', 'radar', '230.52.53.2', 21052, '230.52.53.2', -4.528, 136.887, 13, true, '{"category": "Primary Radar", "manufacturer": "ATCRDS", "model": "ASR-23"}')
ON CONFLICT DO NOTHING;

-- Insert ADS-B Stations (13 Papua ADS-B Stations)
INSERT INTO surveillance_stations (name, type, ip, port, multicast_ip, lat, lng, airport_id, is_active, config) VALUES 
-- Sentani ADS-B
('Sentani ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -2.599, 140.528, 1, true, '{"category": "ADS-B", "manufacturer": "Mode-S", "model": "1090ES"}'),
-- Biak ADS-B
('Biak ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -1.187, 136.112, 11, true, '{"category": "ADS-B", "manufacturer": "Mode-S", "model": "1090ES"}'),
-- Merauke ADS-B
('Merauke ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -8.513, 140.411, (SELECT id FROM airports WHERE name = 'Mopah' LIMIT 1), true, '{"category": "ADS-B", "manufacturer": "Mode-S", "model": "1090ES"}'),
-- Sorong ADS-B
('Sorong ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -0.891, 131.288, (SELECT id FROM airports WHERE name = 'Domine Eduard Osok' LIMIT 1), true, '{"category": "ADS-B", "manufacturer": "Mode-S", "model": "1090ES"}'),
-- Timika ADS-B
('Timika ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -4.528, 136.887, 13, true, '{"category": "ADS-B", "manufacturer": "Mode-S", "model": "1090ES"}'),
-- Nabire ADS-B (find airport)
('Nabire ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -3.367, 135.500, (SELECT id FROM airports WHERE name LIKE '%Nabire%' LIMIT 1), true, '{"category": "ADS-B", "manufacturer": "Mode-S", "model": "1090ES"}'),
-- Senggeh ADS-B
('Senggeh ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -2.583, 140.817, 1, true, '{"category": "ADS-B", "manufacturer": "Mode-S", "model": "1090ES"}'),
-- Elelim ADS-B
('Elelim ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -4.083, 139.550, (SELECT id FROM airports WHERE name LIKE '%Oksibil%' LIMIT 1), true, '{"category": "ADS-B", "manufacturer": "Mode-S", "model": "1090ES"}'),
-- Dekai ADS-B
('Dekai ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -4.824, 139.762, (SELECT id FROM airports WHERE name LIKE '%Dekai%' LIMIT 1), true, '{"category": "ADS-B", "manufacturer": "Mode-S", "model": "1090ES"}'),
-- Oksibil ADS-B
('Oksibil ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -4.904, 140.628, (SELECT id FROM airports WHERE name LIKE '%Oksibil%' LIMIT 1), true, '{"category": "ADS-B", "manufacturer": "Mode-S", "model": "1090ES"}'),
-- Wamena ADS-B
('Wamena ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -4.102, 138.943, (SELECT id FROM airports WHERE name LIKE '%Wamena%' LIMIT 1), true, '{"category": "ADS-B", "manufacturer": "Mode-S", "model": "1090ES"}'),
-- Kaimana ADS-B
('Kaimana ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -3.667, 133.733, (SELECT id FROM airports WHERE name LIKE '%Kaimana%' LIMIT 1), true, '{"category": "ADS-B", "manufacturer": "Mode-S", "model": "1090ES"}'),
-- Manokwari ADS-B
('Manokwari ADS-B', 'adsb', '239.71.40.2', 50000, '239.71.40.2', -0.892, 134.052, (SELECT id FROM airports WHERE name LIKE '%Rendani%' LIMIT 1), true, '{"category": "ADS-B", "manufacturer": "Mode-S", "model": "1090ES"}')
ON CONFLICT DO NOTHING;

-- Verify inserted data
SELECT * FROM surveillance_stations ORDER BY type, name;

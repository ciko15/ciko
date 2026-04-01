-- Seed Equipment for Surveillance (RADAR & ADS-B)
-- This adds radar and ADS-B equipment to the equipment table

-- First, let's add radar equipment for each Papua radar station
INSERT IGNORE INTO equipment (name, code, category, status, airport_id, description, snmp_config, is_active) VALUES 
-- Sentani Radar Equipment
('Primary Radar Sentani', 'RADAR-SENTANI-001', 'Surveillance', 'Normal', 1, 'Primary Surveillance Radar - ASTERIX CAT048', '{"enabled": true, "method": "asterix", "ip": "225.30.210.1", "port": 4001, "multicast_ip": "225.30.210.1", "templateId": "radar_system"}', true),
('ADS-B Receiver Sentani', 'ADSBS-SENTANI-001', 'Surveillance', 'Normal', 1, 'ADS-B Receiver Papua - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "templateId": "adsb_receiver"}', true),

-- Biak Radar Equipment
('Primary Radar Biak', 'RADAR-BIAK-001', 'Surveillance', 'Normal', 11, 'Primary Surveillance Radar - ASTERIX CAT048', '{"enabled": true, "method": "asterix", "ip": "230.52.53.3", "port": 21053, "multicast_ip": "230.52.53.3", "templateId": "radar_system"}', true),
('ADS-B Receiver Biak', 'ADSBS-BIAK-001', 'Surveillance', 'Normal', 11, 'ADS-B Receiver Biak - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "templateId": "adsb_receiver"}', true),

-- Merauke Radar Equipment
('Primary Radar Merauke', 'RADAR-MERAUKE-001', 'Surveillance', 'Normal', 52, 'Primary Surveillance Radar - ASTERIX CAT048', '{"enabled": true, "method": "asterix", "ip": "230.52.53.5", "port": 21055, "multicast_ip": "230.52.53.5", "templateId": "radar_system"}', true),
('ADS-B Receiver Merauke', 'ADSBS-MERAUKE-001', 'Surveillance', 'Normal', 52, 'ADS-B Receiver Merauke - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "templateId": "adsb_receiver"}', true),

-- Sorong Radar Equipment
('Primary Radar Sorong', 'RADAR-SORONG-001', 'Surveillance', 'Normal', 51, 'Primary Surveillance Radar - ASTERIX CAT048', '{"enabled": true, "method": "asterix", "ip": "230.52.53.4", "port": 21054, "multicast_ip": "230.52.53.4", "templateId": "radar_system"}', true),
('ADS-B Receiver Sorong', 'ADSBS-SORONG-001', 'Surveillance', 'Normal', 51, 'ADS-B Receiver Sorong - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "templateId": "adsb_receiver"}', true),

-- Timika Radar Equipment
('Primary Radar Timika', 'RADAR-TIMIKA-001', 'Surveillance', 'Normal', 13, 'Primary Surveillance Radar - ASTERIX CAT048', '{"enabled": true, "method": "asterix", "ip": "230.52.53.2", "port": 21052, "multicast_ip": "230.52.53.2", "templateId": "radar_system"}', true),
('ADS-B Receiver Timika', 'ADSBS-TIMIKA-001', 'Surveillance', 'Normal', 13, 'ADS-B Receiver Timika - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "templateId": "adsb_receiver"}', true),

-- Additional ADS-B Stations
('ADS-B Receiver Nabire', 'ADSBS-NABIRE-001', 'Surveillance', 'Normal', 45, 'ADS-B Receiver Nabire - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "templateId": "adsb_receiver"}', true),
('ADS-B Receiver Senggeh', 'ADSBS-SENGGEH-001', 'Surveillance', 'Normal', 1, 'ADS-B Receiver Senggeh - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "templateId": "adsb_receiver"}', true),
('ADS-B Receiver Elelim', 'ADSBS-ELIMIN-001', 'Surveillance', 'Normal', 44, 'ADS-B Receiver Elelim - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "templateId": "adsb_receiver"}', true),
('ADS-B Receiver Dekai', 'ADSBS-DEKAI-001', 'Surveillance', 'Normal', 42, 'ADS-B Receiver Dekai - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "templateId": "adsb_receiver"}', true),
('ADS-B Receiver Oksibil', 'ADSBS-OKSIBIL-001', 'Surveillance', 'Normal', 43, 'ADS-B Receiver Oksibil - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "templateId": "adsb_receiver"}', true),
('ADS-B Receiver Wamena', 'ADSBS-WAMENA-001', 'Surveillance', 'Normal', 41, 'ADS-B Receiver Wamena - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "templateId": "adsb_receiver"}', true),
('ADS-B Receiver Kaimana', 'ADSBS-KAIMANA-001', 'Surveillance', 'Normal', 49, 'ADS-B Receiver Kaimana - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "templateId": "adsb_receiver"}', true),
('ADS-B Receiver Manokwari', 'ADSBS-MANOKWARI-001', 'Surveillance', 'Normal', 50, 'ADS-B Receiver Manokwari - 1090ES', '{"enabled": true, "method": "adsb", "ip": "239.71.40.2", "port": 50000, "multicast_ip": "239.71.40.2", "templateId": "adsb_receiver"}', true);

-- Verify inserted equipment
SELECT e.id, e.name, e.code, e.category, e.status, a.name as airport_name 
FROM equipment e 
LEFT JOIN airports a ON e.airport_id = a.id 
WHERE e.category = 'Surveillance' 
ORDER BY e.code;

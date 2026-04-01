-- Add Wamena and Dekai airports to existing database
-- Run this script to add the new airports

-- Check current max airport ID first
SELECT MAX(id) FROM airports;

-- Insert Wamena airport (as child of Sentani/Jayapura which has id=1)
INSERT INTO airports (name, city, lat, lng, parent_id) 
VALUES ('Wamena', 'Jayapura', -4.1025, 138.9429, 1)
ON CONFLICT DO NOTHING;

-- Insert Dekai airport (as child of Wamena - we need to find Wamena's ID first)
-- This will be added after Wamena is inserted
INSERT INTO airports (name, city, lat, lng, parent_id) 
SELECT 'Dekai', 'Yahukimo', -4.8241, 139.7625, id 
FROM airports 
WHERE name = 'Wamena'
ON CONFLICT DO NOTHING;

-- Verify insertion
SELECT id, name, city, parent_id FROM airports WHERE name IN ('Wamena', 'Dekai', 'Sentani');

